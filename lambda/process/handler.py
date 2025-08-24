import os
import boto3
import csv
import json
from datetime import datetime
import uuid
from io import StringIO
import traceback

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')
cognito = boto3.client('cognito-idp')

def parse_medisys_csv(csv_content):
    """Parse the MediSys CSV format where each row is a test result"""
    print(f"🔍 Starting MediSys CSV parsing. Content preview: {csv_content[:200]}...")
    
    try:
        # use CSV DictReader to parse the content
        csv_reader = csv.DictReader(StringIO(csv_content))
        
        reports = []
        current_report = None
        
        for row_num, row in enumerate(csv_reader):
            try:
                # Clean up the row data
                cleaned_row = {k.strip(): v.strip() if isinstance(v, str) else v for k, v in row.items() if k}
                
                patient_id = cleaned_row.get('patient_id', '').strip()
                if not patient_id:
                    print(f"⚠️ Skipping row {row_num} - no patient_id")
                    continue
                
                # Check if this is a new patient or same patient
                if not current_report or current_report['patient_id'] != patient_id:
                    # Save previous report 
                    if current_report:
                        reports.append(current_report)
                    
                    # Start new report
                    current_report = {
                        'patient_id': patient_id,
                        'patient_name': f"{cleaned_row.get('first_name', '')} {cleaned_row.get('last_name', '')}".strip(),
                        'patient_dob': cleaned_row.get('patient_dob', ''),
                        'patient_gender': cleaned_row.get('patient_gender', ''),
                        'clinic_id': cleaned_row.get('clinic_id', ''),
                        'test_date': cleaned_row.get('test_date', ''),
                        'ordering_physician': cleaned_row.get('ordering_physician', ''),
                        'report_date': cleaned_row.get('report_date', ''),
                        'report_id': cleaned_row.get('report_id', ''),
                        'test_results': [],
                        'notes': []
                    }
                
                # Add test result to current report
                test_result = {
                    'test_type': cleaned_row.get('test_type', ''),
                    'test_name': cleaned_row.get('test_name', ''),
                    'result': cleaned_row.get('result_value', ''),
                    'unit': cleaned_row.get('result_unit', ''),
                    'reference_range': cleaned_row.get('reference_range', ''),
                    'status': cleaned_row.get('status', ''),
                    'critical_flag': cleaned_row.get('critical_flag', '')
                }
                
                # Only add if test name exists
                if test_result['test_name']:
                    current_report['test_results'].append(test_result)
                
                # Collect notes
                note = cleaned_row.get('notes', '').strip()
                if note and note not in current_report['notes']:
                    current_report['notes'].append(note)
                
                print(f"📝 Processed row {row_num}: {test_result['test_name']} for patient {patient_id}")
                
            except Exception as e:
                print(f"❌ Error processing row {row_num}: {str(e)}")
                continue
        
     
        if current_report:
            reports.append(current_report)
        
        print(f"✅ Parsing complete. Found {len(reports)} patient reports")
        for i, report in enumerate(reports):
            print(f"  Report {i+1}: {report['patient_name']} ({report['patient_id']}) - {len(report['test_results'])} tests")
        
        return reports
        
    except Exception as e:
        print(f"❌ Critical error parsing CSV: {str(e)}")
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise e

def extract_clinic_id_from_key(s3_key):
    """Extract clinic ID from S3 key, handling both UI and CLI upload paths"""
    print(f"🔍 Extracting clinic ID from S3 key: {s3_key}")
    
    # UI uploads: public/uploads/clinic_id/filename.csv
    if s3_key.startswith('public/uploads/'):
        path_parts = s3_key.split('/')
        if len(path_parts) >= 3:
            clinic_id = path_parts[2]  # public/uploads/[clinic_id]/filename
            print(f"🏥 UI upload - extracted clinic ID: {clinic_id}")
            return clinic_id
    
    #  debugging CLI uploads: uploads/clinic_id/filename.csv
    elif s3_key.startswith('uploads/'):
        path_parts = s3_key.split('/')
        if len(path_parts) >= 2:
            clinic_id = path_parts[1]  # uploads/[clinic_id]/filename
            print(f"🏥 CLI upload - extracted clinic ID: {clinic_id}")
            return clinic_id
    
    # fallback
    print("⚠️ Could not extract clinic ID from path, using 'unknown'")
    return 'unknown'

def send_sqs_notification(patient_name, patient_id, clinic_id, report_id, timestamp, test_results, remarks):
    """Send notification to SQS queue for healthcare users to poll"""
    try:
        queue_url = os.environ.get('NOTIFICATION_QUEUE_URL')
        if not queue_url:
            print("❌ No SQS queue URL configured in environment variables")
            return False
        
        print(f"📤 Sending SQS notification to: {queue_url}")
        
        # create notification message
        notification_message = {
            'type': 'NEW_REPORT',
            'report_id': report_id,
            'patient_name': patient_name,
            'patient_id': patient_id,
            'clinic_id': clinic_id,
            'timestamp': timestamp,
            'test_count': len(test_results),
            'test_summary': [
                {
                    'test_name': test['test_name'],
                    'result': test['result'],
                    'unit': test.get('unit', ''),
                    'status': test.get('status', '')
                } for test in test_results[:3]  
            ],
            'has_remarks': bool(remarks),
            'created_at': datetime.now().isoformat()
        }
        
        print(f"📋 Notification message: {json.dumps(notification_message, indent=2)}")
        
        # Send message to SQS
        response = sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(notification_message),
            MessageAttributes={
                'ReportType': {
                    'StringValue': 'DIAGNOSTIC_REPORT',
                    'DataType': 'String'
                },
                'ClinicId': {
                    'StringValue': clinic_id,
                    'DataType': 'String'
                },
                'Priority': {
                    'StringValue': 'NORMAL',
                    'DataType': 'String'
                }
            }
        )
        
        print(f"✅ Notification sent to SQS: MessageId {response['MessageId']}")
        return True
        
    except Exception as e:
        print(f"❌ Error sending SQS notification: {str(e)}")
        traceback.print_exc()
        return False

def process_single_file(bucket, key, table):
    """Process a single file from S3"""
    try:
        print(f"📂 File details:")
        print(f"   - Bucket: {bucket}")
        print(f"   - Key: {key}")
        
        # Check if file is in uploads folder 
        if not (key.startswith('public/uploads/') or key.startswith('uploads/')):
            print(f"⚠️ Skipping file not in uploads folder: {key}")
            return False
        
        # Get the uploaded file
        print(f"⬇️ Downloading file from S3...")
        response = s3.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        print(f"📄 File downloaded successfully. Content length: {len(content)} characters")
        
        if len(content) == 0:
            print("❌ File is empty, skipping...")
            return False
        
        # Parse CSV content
        print(f"🔍 Parsing MediSys CSV content...")
        patient_reports = parse_medisys_csv(content)
        print(f"✅ CSV parsed successfully, found {len(patient_reports)} patient reports")
        
        if not patient_reports:
            print("❌ No valid patient reports found in CSV")
            return False
        
        # extract clinic info from S3 
        extracted_clinic_id = extract_clinic_id_from_key(key)
        
        processed_count = 0
        
        # process each patient report
        for report_data in patient_reports:
            try:
                # generate unique report ID for each patient
                report_id = str(uuid.uuid4())
                print(f"🆔 Generated report ID: {report_id}")
                
                # use clinic_id from CSV 
                clinic_id = report_data.get('clinic_id') or extracted_clinic_id
                patient_name = report_data.get('patient_name', 'Unknown Patient')
                patient_id = report_data.get('patient_id', 'Unknown ID')
                
                print(f"🏥 Patient info:")
                print(f"   - Name: {patient_name}")
                print(f"   - ID: {patient_id}")
                print(f"   - Clinic: {clinic_id}")
                print(f"   - Test count: {len(report_data['test_results'])}")
                
                # create DynamoDB item
                current_time = datetime.now().isoformat()
                
                # Prepare patient_info object 
                patient_info = {
                    'patient_name': patient_name,
                    'patient_id': patient_id,
                    'patient_dob': report_data.get('patient_dob', ''),
                    'patient_gender': report_data.get('patient_gender', ''),
                    'test_date': report_data.get('test_date', ''),
                    'report_date': report_data.get('report_date', ''),
                    'ordering_physician': report_data.get('ordering_physician', ''),
                    'clinic_id': clinic_id
                }
                
                # Combine notes as remarks
                remarks = '. '.join(report_data.get('notes', [])) if report_data.get('notes') else ''
                
                item = {
                    'report_id': report_id,
                    'clinic_id': clinic_id,
                    'patient_id': patient_id,
                    'patient_name': patient_name,
                    'timestamp': current_time,
                    's3_key': key,
                    's3_bucket': bucket,
                    'status': 'processed',
                    'patient_info': patient_info,
                    'test_results': report_data['test_results'],
                    'remarks': remarks,
                    'processing_time': current_time,
                    'source': 'ui_upload' if key.startswith('public/') else 'cli_upload'
                }
                
                print(f"💾 Preparing to store in DynamoDB...")
                
                # Store in DynamoDB
                table.put_item(Item=item)
                print(f"✅ Successfully stored report {report_id} in DynamoDB")
                
                # Verify the item was stored
                try:
                    verify_response = table.get_item(Key={'report_id': report_id})
                    if 'Item' in verify_response:
                        print(f"✅ Verified: Item exists in DynamoDB")
                    else:
                        print(f"⚠️ Warning: Item not found in DynamoDB after put_item")
                except Exception as verify_error:
                    print(f"⚠️ Could not verify DynamoDB storage: {str(verify_error)}")
                
                # Send SQS notification
                print(f"📨 Sending notification...")
                notification_sent = send_sqs_notification(
                    patient_name, 
                    patient_id, 
                    clinic_id, 
                    report_id, 
                    current_time, 
                    report_data['test_results'], 
                    remarks
                )
                
                if notification_sent:
                    print("✅ Notification sent successfully")
                else:
                    print("⚠️ Notification failed but continuing...")
                
                processed_count += 1
                
            except Exception as e:
                print(f"❌ Error processing patient report for {report_data.get('patient_name', 'Unknown')}: {str(e)}")
                print(f"❌ Full traceback: {traceback.format_exc()}")
                continue
        
        print(f"🎉 Successfully processed {processed_count}/{len(patient_reports)} patient reports")
        return processed_count > 0
        
    except Exception as e:
        print(f"❌ Error processing file {key}: {str(e)}")
        print(f"❌ Full traceback: {traceback.format_exc()}")
        return False

def process(event, context):
    """Main Lambda handler"""
    print(f"🚀 Lambda function started. Event: {json.dumps(event, default=str)}")
    
    # check environment variables
    table_name = os.environ.get('REPORTS_TABLE')
    queue_url = os.environ.get('NOTIFICATION_QUEUE_URL')
    
    print(f"🔧 Environment check:")
    print(f"   - REPORTS_TABLE: {table_name}")
    print(f"   - NOTIFICATION_QUEUE_URL: {queue_url}")
    print(f"   - AWS_REGION: {os.environ.get('AWS_REGION', 'not set')}")
    print(f"   - Function Name: {context.function_name}")
    print(f"   - Function Version: {context.function_version}")
    
    if not table_name:
        print("❌ REPORTS_TABLE environment variable not set")
        return {'statusCode': 500, 'body': 'Configuration error: Missing table name'}
    
    table = dynamodb.Table(table_name)
    
    try:
        processed_files = 0
        
        # check if this is an S3 Records event (from bucket notifications)
        print(f"🔍 Event structure analysis:")
        print(f"   - Event keys: {list(event.keys())}")
        print(f"   - Event source: {event.get('source', 'not set')}")
        
        # handle S3 format (bucket notifications)
        if 'Records' in event:
            print("📁 Processing S3 Records event (bucket notification)")
            
            for record_num, record in enumerate(event['Records']):
                print(f"\n📁 Processing record {record_num + 1}/{len(event['Records'])}")
                
                # verify  S3 event
                if record.get('eventSource') != 'aws:s3':
                    print(f"⚠️ Skipping non-S3 event: {record.get('eventSource')}")
                    continue
                
                # Extract S3 info
                s3_info = record.get('s3', {})
                bucket = s3_info.get('bucket', {}).get('name')
                key = s3_info.get('object', {}).get('key')
                
               
                if key:
                    import urllib.parse
                    key = urllib.parse.unquote_plus(key)
                
                if not bucket or not key:
                    print(f"❌ Missing S3 bucket or key in record")
                    continue

                print(f"🔍 Processing S3 event:")
                print(f"   - Event Name: {record.get('eventName')}")
                print(f"   - Bucket: {bucket}")
                print(f"   - Key: {key}")

                success = process_single_file(bucket, key, table)
                if success:
                    processed_files += 1
                    
        # EventBridge S3 event (fallback)
        elif event.get('source') == 'aws.s3' and event.get('detail-type') == 'Object Created':
            print("📁 Processing EventBridge S3 event")
            
            detail = event.get('detail', {})
            bucket = detail.get('bucket', {}).get('name')
            key = detail.get('object', {}).get('key')
            
            if not bucket or not key:
                print(f"❌ Missing S3 bucket or key in EventBridge event")
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'Invalid EventBridge event format',
                        'message': 'Expected bucket and key in detail'
                    })
                }
            
            # Process single file 
            success = process_single_file(bucket, key, table)
            if success:
                processed_files = 1
        
        else:
            print("❌ Unrecognized event format")
            print(f"❌ Event: {json.dumps(event, default=str, indent=2)}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Invalid event format',
                    'message': 'Expected S3 Records format or EventBridge S3 event'
                })
            }
        
        print(f"\n🎉 Processing complete! Successfully processed {processed_files} files")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Reports processed successfully',
                'processed_files': processed_files,
                'function_name': context.function_name,
                'timestamp': datetime.now().isoformat()
            })
        }
        
    except Exception as e:
        print(f"💥 Critical error in lambda function: {str(e)}")
        print(f"💥 Full traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'message': 'Critical error in processing',
                'function_name': context.function_name,
                'timestamp': datetime.now().isoformat()
            })
        }