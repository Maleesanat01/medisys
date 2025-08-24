const awsmobile = {
  //paths removed for security purpose
  "aws_project_region": "ap-south-1", 
  "aws_cognito_identity_pool_id": "ap-south-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // From CDK output
  "aws_cognito_region": "ap-south-1", 
  "aws_user_pools_id": "ap-south-1_xxxxxxxxx", 
  "aws_user_pools_web_client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxx", // From CDK output
  "oauth": {},
  "aws_cognito_username_attributes": ["EMAIL"],
  "aws_cognito_social_providers": [],
  "aws_cognito_signup_attributes": ["EMAIL"],
  "aws_cognito_mfa_configuration": "OFF",
  "aws_cognito_mfa_types": ["SMS"],
  "aws_cognito_password_protection_settings": {
    "passwordPolicyMinLength": 8,
    "passwordPolicyCharacters": []
  },
  "aws_cognito_verification_mechanisms": ["EMAIL"],
  "aws_user_files_s3_bucket": "medisysstack-reportsbucketxxxxxxxx-xxxxxxxxxxxx", // From CDK output
  "aws_user_files_s3_bucket_region": "ap-south-1", 
  "aws_cloud_logic_custom": [
    {
      "name": "MedisysAPI",
      "endpoint": "https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod", // From CDK output
      "region": "ap-south-1" 
    }
  ],
  
  "custom": {
    "notification_queue_url": "https://sqs.ap-south-1.amazonaws.com/xxxxxxxxxxx/medisys-report-notifications", // From CDK output: NotificationQueueUrl
    "notification_dlq_url": " https://sqs.ap-south-1.amazonaws.com/xxxxxxxxxxx/medisys-report-notifications-dlq", // From CDK output: NotificationDLQUrl
    "reports_table_name": "MedisysStack-ReportsTablexxxxxxxx-xxxxxxxxxxxx" // From CDK output: ReportsTableName
  }
};

export default awsmobile;
