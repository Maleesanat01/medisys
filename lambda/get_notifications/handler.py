import os
import boto3
import json
from decimal import Decimal

sqs = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def handler(event, context):
    """
    Handle notification polling and acknowledgment for healthcare users
    """
    
    try:
        # Handle CORS preflight requests
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
                },
                'body': ''
            }

        print(f"Event: {json.dumps(event, default=str)}")

        # Verify authentication
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})

        if not claims:
            print("No authorization claims found")
            return {
                'statusCode': 401,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
                },
                'body': json.dumps({'error': 'Unauthorized'})
            }

        user_role = claims.get('custom:role', 'user')
        user_sub = claims.get('sub')
        
        #  healthcare users can access notifications
        if user_role != 'healthcare':
            return {
                'statusCode': 403,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
                },
                'body': json.dumps({'error': 'Access denied. Healthcare role required.'})
            }

        queue_url = os.environ.get('NOTIFICATION_QUEUE_URL')
        if not queue_url:
            raise Exception("SQS queue URL not configured")

        http_method = event.get('httpMethod', 'GET')
        
        if http_method == 'GET':
            # poll for new notifications
            return poll_notifications(queue_url, user_sub)
        elif http_method == 'DELETE':
            # acknowledge a notification
            message_id = event.get('pathParameters', {}).get('messageId')
            return acknowledge_notification(queue_url, message_id, user_sub)
        else:
            return {
                'statusCode': 405,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }

    except Exception as e:
        print(f"Error in notifications handler: {str(e)}")
        import traceback
        traceback.print_exc()

        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
            },
            'body': json.dumps({'error': 'Internal server error', 'message': str(e)})
        }

def poll_notifications(queue_url, user_sub):
    """Poll SQS queue for new notifications"""
    try:
        print(f"Polling notifications for user: {user_sub}")
        
        # receive messages from SQS (
        response = sqs.receive_message(
            QueueUrl=queue_url,
            AttributeNames=['All'],
            MessageAttributeNames=['All'],
            MaxNumberOfMessages=10,  # 10 messages
            WaitTimeSeconds=5,       #  API Gateway timeout
            VisibilityTimeout=300    # 5 minutes to process
        )
        
        messages = response.get('Messages', [])
        print(f"Received {len(messages)} notifications")
        
        # format notifications for frontend
        notifications = []
        for message in messages:
            try:
                body = json.loads(message['Body'])
                
                notification = {
                    'id': message['MessageId'],
                    'receipt_handle': message['ReceiptHandle'],  
                    'type': body.get('type', 'UNKNOWN'),
                    'report_id': body.get('report_id'),
                    'patient_name': body.get('patient_name'),
                    'patient_id': body.get('patient_id'),
                    'clinic_id': body.get('clinic_id'),
                    'timestamp': body.get('timestamp'),
                    'test_count': body.get('test_count', 0),
                    'test_summary': body.get('test_summary', []),
                    'has_remarks': body.get('has_remarks', False),
                    'created_at': body.get('created_at'),
                    'message_attributes': message.get('MessageAttributes', {})
                }
                
                notifications.append(notification)
                
            except Exception as e:
                print(f"Error parsing notification: {str(e)}")
                continue
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'notifications': notifications,
                'count': len(notifications),
                'timestamp': boto3.Session().region_name 
            }, cls=DecimalEncoder)
        }
        
    except Exception as e:
        print(f"Error polling notifications: {str(e)}")
        raise e

def acknowledge_notification(queue_url, message_id, user_sub):
    """Delete/acknowledge a processed notification"""
    try:
        if not message_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
                },
                'body': json.dumps({'error': 'Message ID required'})
            }
        
  
        print(f"Acknowledging notification {message_id} for user {user_sub}")
        
        # return success 
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'message': 'Notification acknowledged',
                'message_id': message_id
            })
        }
        
    except Exception as e:
        print(f"Error acknowledging notification: {str(e)}")
        raise e