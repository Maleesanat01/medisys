import json
import boto3
import os
from decimal import Decimal
from boto3.dynamodb.conditions import Key

# Initialize DynamoDB table
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['REPORTS_TABLE'])

def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def handler(event, context):
    """
    Get reports based on user role and clinic access:
    - Lab users: Only see reports from their clinic
    - Healthcare users: See all reports across all clinics
    - Admin users: See all reports across all clinics
    """
    
    try:
        # Extract user info from Cognito JWT 
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        
        if not claims:
            return {
                'statusCode': 401,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({'error': 'No user claims found'})
            }
        
        # get user role and clinic_id from custom attributes
        user_groups = claims.get('cognito:groups', '').split(',') if claims.get('cognito:groups') else []
        user_clinic_id = claims.get('custom:clinic_id', '')
        user_role = claims.get('custom:role', '')
        
        # determine the primary role 
        primary_role = None
        role_priority = ['admin', 'healthcare', 'lab']  
        for role in role_priority:
            if role in user_groups:
                primary_role = role
                break
        

        if not primary_role and user_role:
            primary_role = user_role
        
        print(f"User role: {primary_role}, Clinic ID: {user_clinic_id}, Groups: {user_groups}")
        
        #  pagination/filtering
        query_params = event.get('queryStringParameters') or {}
        limit = int(query_params.get('limit', 100))  
        clinic_filter = query_params.get('clinic_id')  
        
        reports = []
        
        if primary_role in ['healthcare', 'admin']:
            # healthcare and admin users can see all reports
            if clinic_filter:
                # if specific clinic requested, use GSI
                response = table.query(
                    IndexName='ClinicIndex',
                    KeyConditionExpression=Key('clinic_id').eq(clinic_filter),
                    ScanIndexForward=False,  # sort by timestamp descending
                    Limit=limit
                )
                reports = response.get('Items', [])
            else:
                # scan all reports
                response = table.scan(Limit=limit)
                reports = response.get('Items', [])
                
                # sort by timestamp 
                reports.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        elif primary_role == 'lab':
            # lab users only see reports from their clinic
            if not user_clinic_id:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                        'Access-Control-Allow-Methods': 'GET,OPTIONS'
                    },
                    'body': json.dumps({'error': 'Lab user must have clinic_id configured'})
                }
            
            # use GSI to query reports for this clinic only
            response = table.query(
                IndexName='ClinicIndex',
                KeyConditionExpression=Key('clinic_id').eq(user_clinic_id),
                ScanIndexForward=False,  # sort by timestamp descending
                Limit=limit
            )
            reports = response.get('Items', [])
        
        else:
            # Unknown role - no access
            return {
                'statusCode': 403,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({'error': 'Insufficient permissions'})
            }
        
        # add metadata to response
        response_data = reports  # Keep backward compatibility
        
        print(f"Returning {len(reports)} reports for user role: {primary_role}, clinic: {user_clinic_id}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps(response_data, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({'error': f'Internal server error: {str(e)}'})
        }