import os
import boto3
import csv
from datetime import datetime
import uuid
import json
from io import StringIO

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
ses = boto3.client('ses')
cognito = boto3.client('cognito-idp')

def parse_medical_csv(csv_content):
    """Parse the medical CSV format into structured data"""
    reader = csv.reader(StringIO(csv_content))
    data = {}
    tests = []
    
    for row in reader:
        if not row[0]:  # Skip empty rows
            continue
        if row[0] == 'Test':  # Test results section
            break
        if len(row) >= 2 and row[1]:
            data[row[0].lower().replace(' ', '_')] = row[1]
    
    # Now parse test results
    test_reader = csv.DictReader(StringIO(csv_content))
    for test_row in test_reader:
        if test_row.get('Test'):
            tests.append({
                'test_name': test_row['Test'],
                'result': test_row['Result'],
                'unit': test_row['Unit'],
                'reference_range': test_row['Reference Range']
            })
    
    return {
        'patient_info': data,
        'test_results': tests,
        'remarks': next((row[1] for row in reader if row[0] == 'Remarks'), '')
    }

def handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    try:
        # 1. Get the uploaded file
        file = s3.get_object(Bucket=bucket, Key=key)
        data = file['Body'].read().decode('utf-8')
        
        # 2. Parse CSV into structured medical data
        report_data = parse_medical_csv(data)
        
        # 3. Store in DynamoDB
        table = dynamodb.Table(os.environ['REPORTS_TABLE'])
        report_id = str(uuid.uuid4())
        
        # Get clinic info from the filename or path
        clinic_id = key.split('/')[1] if '/' in key else 'unknown'
        
        item = {
            'report_id': report_id,
            'clinic_id': clinic_id,
            'patient_id': report_data['patient_info'].get('patient_id', 'unknown'),
            'patient_name': report_data['patient_info'].get('patient_name', 'unknown'),
            'timestamp': datetime.now().isoformat(),
            's3_key': key,
            'status': 'processed',
            'patient_info': report_data['patient_info'],
            'test_results': report_data['test_results'],
            'remarks': report_data['remarks']
        }
        
        table.put_item(Item=item)
        
        # 4. Get all healthcare users from Cognito
        users = cognito.list_users_in_group(
            UserPoolId=os.environ['USER_POOL_ID'],
            GroupName='Healthcare'
        )['Users']
        
        # 5. Send notifications
        recipient_emails = [user['Attributes'][0]['Value'] for user in users 
                          if any(attr['Name'] == 'email' for attr in user['Attributes'])]
        
        if recipient_emails:
            ses.send_email(
                Source=os.environ['SENDER_EMAIL'],
                Destination={'ToAddresses': recipient_emails},
                Message={
                    'Subject': {'Data': f'New Diagnostic Report for {item["patient_name"]}'},
                    'Body': {
                        'Text': {
                            'Data': f'A new diagnostic report has been uploaded:\n\n'
                                    f'Patient: {item["patient_name"]}\n'
                                    f'Clinic: {item["clinic_id"]}\n'
                                    f'Date: {item["timestamp"]}\n\n'
                                    f'View in dashboard for details.'
                        }
                    }
                }
            )
        
        # Also send confirmation to uploader
        uploader_email = event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('email')
        if uploader_email:
            ses.send_email(
                Source=os.environ['SENDER_EMAIL'],
                Destination={'ToAddresses': [uploader_email]},
                Message={
                    'Subject': {'Data': 'Your report upload was successful'},
                    'Body': {
                        'Text': {
                            'Data': f'Your diagnostic report for {item["patient_name"]} has been successfully processed.\n\n'
                                    f'Report ID: {report_id}\n'
                                    f'Processing time: {item["timestamp"]}'
                        }
                    }
                }
            )
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Report processed successfully', 'report_id': report_id})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }