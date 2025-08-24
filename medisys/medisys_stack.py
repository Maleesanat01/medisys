from aws_cdk import (
    Stack, RemovalPolicy, Duration, CfnOutput,
    aws_s3 as s3,
    aws_lambda as lambda_,
    aws_dynamodb as ddb,
    aws_cognito as cognito,
    aws_sqs as sqs,
    aws_apigateway as apigw,
    aws_iam as iam,
    aws_s3_notifications as s3_notifications,
    aws_logs as logs
)
from constructs import Construct
import json

class MedisysStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ========== DynamoDB Table ==========
        self.reports_table = ddb.Table(
            self, "ReportsTable",
            partition_key={"name": "report_id", "type": ddb.AttributeType.STRING},
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            point_in_time_recovery_specification=ddb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            )
        )

        '''Index for clinic(Lab) queries with partitions by clinic id with sort key by
        timestamp to sort items in that clinic'''
        self.reports_table.add_global_secondary_index(
            index_name="ClinicIndex",
            partition_key={"name": "clinic_id", "type": ddb.AttributeType.STRING},
            sort_key={"name": "timestamp", "type": ddb.AttributeType.STRING}
        )

        # ========== Cognito User Pool ==========
        self.user_pool = cognito.UserPool(
            self, "UserPool",
            self_sign_up_enabled=False,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True, mutable=True),
                given_name=cognito.StandardAttribute(required=True, mutable=True)
            ),
            custom_attributes={
                "role": cognito.StringAttribute(mutable=True),
                "clinic_id": cognito.StringAttribute(mutable=True)
            },
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=True
            ),
            removal_policy=RemovalPolicy.DESTROY
        )

        # User Pool Client
        self.user_pool_client = self.user_pool.add_client(
            "WebClient",
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True
            ),
            generate_secret=False
        )

        # User Groups
        lab_group = cognito.CfnUserPoolGroup(
            self, "LabGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="lab",
            description="Laboratory staff who can upload reports"
        )

        healthcare_group = cognito.CfnUserPoolGroup(
            self, "HealthcareGroup", 
            user_pool_id=self.user_pool.user_pool_id,
            group_name="healthcare",
            description="Healthcare team members who can view reports"
        )

        admin_group = cognito.CfnUserPoolGroup(
            self, "AdminGroup",
            user_pool_id=self.user_pool.user_pool_id,
            group_name="admin", 
            description="Administrators who can create users"
        )

        # Identity Pool
        self.identity_pool = cognito.CfnIdentityPool(
            self, "IdentityPool",
            allow_unauthenticated_identities=False,
            cognito_identity_providers=[
                cognito.CfnIdentityPool.CognitoIdentityProviderProperty(
                    client_id=self.user_pool_client.user_pool_client_id,
                    provider_name=self.user_pool.user_pool_provider_name
                )
            ]
        )

        # IAM Roles for Identity Pool
        authenticated_role = iam.Role(
            self, "CognitoAuthenticatedRole",
            assumed_by=iam.FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                conditions={
                    "StringEquals": {
                        "cognito-identity.amazonaws.com:aud": self.identity_pool.ref
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "authenticated"
                    }
                },
                assume_role_action="sts:AssumeRoleWithWebIdentity"
            )
        )

        # Grant S3 access to authenticated users
        authenticated_role.add_to_policy(
            iam.PolicyStatement(
                actions=["s3:PutObject", "s3:GetObject"],
                resources=[f"arn:aws:s3:::*/*"]  # all permissions for authorized users
            )
        )

        # Attach roles to identity pool
        cognito.CfnIdentityPoolRoleAttachment(
            self, "IdentityPoolRoleAttachment",
            identity_pool_id=self.identity_pool.ref,
            roles={
                "authenticated": authenticated_role.role_arn
            }
        )

        # ========== SQS Queue for Notifications ==========
        # Dead Letter Queue for failed processing
        self.notification_dlq = sqs.Queue(
            self, "ReportNotificationDLQ",
            queue_name="medisys-report-notifications-dlq",
            retention_period=Duration.days(14),
            removal_policy=RemovalPolicy.DESTROY
        )
        
        # Main notification queue
        self.notification_queue = sqs.Queue(
            self, "ReportNotificationQueue",
            queue_name="medisys-report-notifications",
            visibility_timeout=Duration.seconds(300),  # 5 minutes
            retention_period=Duration.days(14),  # Keep messages for 2 weeks
            receive_message_wait_time=Duration.seconds(20),  # Long polling
            delivery_delay=Duration.seconds(0),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.notification_dlq
            ),
            removal_policy=RemovalPolicy.DESTROY
        )

        # ========== Lambda Functions ==========
        # Process Lambda (triggered by S3 uploads)
        self.process_lambda = lambda_.Function(
            self, "ProcessReportsFunction",
            runtime=lambda_.Runtime.PYTHON_3_13,
            code=lambda_.Code.from_asset("lambda/process"),
            handler="handler.process",
            timeout=Duration.seconds(30),
            memory_size=256,
            environment={
                "REPORTS_TABLE": self.reports_table.table_name,
                "USER_POOL_ID": self.user_pool.user_pool_id,
                "NOTIFICATION_QUEUE_URL": self.notification_queue.queue_url,
                "SENDER_EMAIL": "amedisys80@gmail.com"
            }
        )

        # Grant permissions to process lambda
        self.reports_table.grant_read_write_data(self.process_lambda)
        self.notification_queue.grant_send_messages(self.process_lambda)
        
        # Grant Cognito permissions
        self.process_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:ListUsersInGroup",
                    "cognito-idp:ListUsers",
                    "cognito-idp:ListGroups"
                ],
                resources=[self.user_pool.user_pool_arn]
            )
        )

        # ========== S3 Bucket  ==========
        self.reports_bucket = s3.Bucket(
            self, "ReportsBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            auto_delete_objects=True,
            removal_policy=RemovalPolicy.DESTROY,
            cors=[
                s3.CorsRule(
                    allowed_headers=["*"],
                    allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                    allowed_origins=["*"],
                    exposed_headers=["ETag"],
                    max_age=3000
                )
            ]
        )

        # Grant S3 read access to process lambda
        self.reports_bucket.grant_read(self.process_lambda)

        # ========== S3 Direct Lambda Triggers ==========
        # Add S3 bucket notification to trigger Lambda directly for frontend uploads
        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="public/uploads/",
                suffix=".csv"
            )
        )
        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="public/uploads/",
                suffix=".xlsx"
            )
        )
        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="public/uploads/",
                suffix=".xls"
            )
        )

        #NOT USED another notification for private uploads
        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="private/uploads/",
                suffix=".csv"
            )
        )

        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="private/uploads/",
                suffix=".xlsx"
            )
        )

        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="private/uploads/",
                suffix=".xls"
            )
        )

        # USED FOR TETSING ONLY another notification for CLI uploads
        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="uploads/",
                suffix=".csv"
            )
        )

        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="uploads/",
                suffix=".xlsx"
            )
        )

        self.reports_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3_notifications.LambdaDestination(self.process_lambda),
            s3.NotificationKeyFilter(
                prefix="uploads/",
                suffix=".xls"
            )
        )

        # Get Reports Lambda
        self.get_reports_lambda = lambda_.Function(
            self, "GetReportsFunction",
            runtime=lambda_.Runtime.PYTHON_3_13,
            code=lambda_.Code.from_asset("lambda/get_reports"),
            handler="handler.handler",
            timeout=Duration.seconds(30),
            environment={
                "REPORTS_TABLE": self.reports_table.table_name
            }
        )

        self.reports_table.grant_read_data(self.get_reports_lambda)

        # Analytics Lambda 
        self.analytics_lambda = lambda_.Function(
            self, "AnalyticsFunction",
            runtime=lambda_.Runtime.PYTHON_3_13,
            code=lambda_.Code.from_asset("lambda/analytics"),
            handler="handler.handler",
            timeout=Duration.seconds(30),
            memory_size=512,  # memory for analytics processing
            environment={
                "REPORTS_TABLE": self.reports_table.table_name
            }
        )

        # Grant read access to reports table for analytics
        self.reports_table.grant_read_data(self.analytics_lambda)
        # Additional IAM permissions for role-based access
        # Grant analytics lambda the same read permissions as get_reports
        self.analytics_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:ListUsersInGroup",
                    "cognito-idp:ListUsers",
                    "cognito-idp:GetUser"
                ],
                resources=[self.user_pool.user_pool_arn]
            )
        )

        # Ensure the get_reports lambda can read user groups for role determination
        self.get_reports_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:ListUsersInGroup",
                    "cognito-idp:ListUsers", 
                    "cognito-idp:GetUser"
                ],
                resources=[self.user_pool.user_pool_arn]
            )
        )

        # Update the authenticated role policy to be more restrictive
        # Remove the overly broad S3 permissions and add more specific ones
        authenticated_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "s3:PutObject",
                    "s3:GetObject"
                ],
                resources=[
                    f"{self.reports_bucket.bucket_arn}/public/uploads/*",
                    f"{self.reports_bucket.bucket_arn}/private/uploads/*",
                    f"{self.reports_bucket.bucket_arn}/uploads/*"  # For testing
                ]
            )
        )
        
        # Add DynamoDB permissions for authenticated users to query their own clinic data
        authenticated_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "dynamodb:Query"
                ],
                resources=[
                    self.reports_table.table_arn,
                    f"{self.reports_table.table_arn}/index/*"
                ],
                conditions={
                    "ForAllValues:StringEquals": {
                        "dynamodb:Attributes": [
                            "report_id",
                            "patient_name", 
                            "patient_id",
                            "clinic_id",
                            "timestamp",
                            "test_results",
                            "status",
                            "patient_info",
                            "processing_time",
                            "source",
                            "remarks"
                        ]
                    }
                }
            )
        )

        # Get Notifications Lambda
        self.get_notifications_lambda = lambda_.Function(
            self, "GetNotificationsFunction",
            runtime=lambda_.Runtime.PYTHON_3_13,
            code=lambda_.Code.from_asset("lambda/get_notifications"),
            handler="handler.handler",
            timeout=Duration.seconds(30),
            environment={
                "NOTIFICATION_QUEUE_URL": self.notification_queue.queue_url,
                "REPORTS_TABLE": self.reports_table.table_name
            }
        )

        # Grant SQS permissions to get notifications lambda
        self.notification_queue.grant_consume_messages(self.get_notifications_lambda)
        self.reports_table.grant_read_data(self.get_notifications_lambda)

        # Create User Lambda
        self.create_user_lambda = lambda_.Function(
            self, "CreateUserFunction",
            runtime=lambda_.Runtime.PYTHON_3_13,
            code=lambda_.Code.from_asset("lambda/create_user"),
            handler="handler.handler",
            timeout=Duration.seconds(30),
            environment={
                "USER_POOL_ID": self.user_pool.user_pool_id
            }
        )

        # Grant Cognito admin permissions
        self.create_user_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:AdminAddUserToGroup",
                    "cognito-idp:AdminGetUser"
                ],
                resources=[self.user_pool.user_pool_arn]
            )
        )

        # ========== API Gateway ==========
        self.api = apigw.RestApi(
            self, "MedisysAPI",
            rest_api_name="MediSys API",
            description="API for MediSys diagnostic reports system",
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=[
                    "Content-Type",
                    "X-Amz-Date",
                    "Authorization",
                    "X-Api-Key",
                    "X-Amz-Security-Token",
                    "X-Amz-User-Agent",
                    "X-Amzn-Trace-Id"
                ],
                allow_credentials=False
            ),
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                throttling_rate_limit=100,
                throttling_burst_limit=200
            )
        )
        # Cognito Authorizer
        auth = apigw.CognitoUserPoolsAuthorizer(
            self, "CognitoAuthorizer",
            cognito_user_pools=[self.user_pool]
        )

        # API Resources
        reports_resource = self.api.root.add_resource("reports")
        users_resource = self.api.root.add_resource("users")
        notifications_resource = self.api.root.add_resource("notifications")
        analytics_resource = self.api.root.add_resource("analytics")  

        # GET /reports
        reports_resource.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.get_reports_lambda,
                proxy=True
            ),
            authorizer=auth,
            authorization_type=apigw.AuthorizationType.COGNITO
        )

        # GET /analytics 
        analytics_resource.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.analytics_lambda,
                proxy=True
            ),
            authorizer=auth,
            authorization_type=apigw.AuthorizationType.COGNITO
        )

        # POST /users
        users_resource.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.create_user_lambda,
                proxy=True
            ),
            authorizer=auth,
            authorization_type=apigw.AuthorizationType.COGNITO
        )

        # GET /notifications
        notifications_resource.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.get_notifications_lambda,
                proxy=True
            ),
            authorizer=auth,
            authorization_type=apigw.AuthorizationType.COGNITO
        )

        # DELETE /notifications/{messageId}
        notification_item = notifications_resource.add_resource("{messageId}")
        notification_item.add_method(
            "DELETE",
            apigw.LambdaIntegration(
                self.get_notifications_lambda,
                proxy=True
            ),
            authorizer=auth,
            authorization_type=apigw.AuthorizationType.COGNITO
        )

        # ========== Outputs ==========
        CfnOutput(self, "UserPoolId", value=self.user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=self.user_pool_client.user_pool_client_id)
        CfnOutput(self, "IdentityPoolId", value=self.identity_pool.ref)
        CfnOutput(self, "BucketName", value=self.reports_bucket.bucket_name)
        CfnOutput(self, "ApiEndpoint", value=self.api.url)
        CfnOutput(self, "ReportsTableName", value=self.reports_table.table_name)
        CfnOutput(self, "NotificationQueueUrl", value=self.notification_queue.queue_url)
        CfnOutput(self, "NotificationDLQUrl", value=self.notification_dlq.queue_url)
        CfnOutput(self, "Region", value=self.region)