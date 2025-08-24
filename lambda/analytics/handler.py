import json
import boto3
import os
from decimal import Decimal
from datetime import datetime, timedelta
from collections import defaultdict, Counter
from boto3.dynamodb.conditions import Key, Attr

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
    Generate analytics based on user role and clinic access:
    - Lab users: Analytics for their clinic only
    - Healthcare users: Analytics for all clinics
    - Admin users: Analytics for all clinics
    """
    
    try:
        # Extract user information from Cognito JWT 
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
        
        # Get user role and clinic_id from custom attributes
        user_groups = claims.get('cognito:groups', '').split(',') if claims.get('cognito:groups') else []
        user_clinic_id = claims.get('custom:clinic_id', '')
        user_role = claims.get('custom:role', '')
        
        # Determine the primary role
        primary_role = None
        role_priority = ['admin', 'healthcare', 'lab']
        for role in role_priority:
            if role in user_groups:
                primary_role = role
                break
        
        if not primary_role and user_role:
            primary_role = user_role
        
        # Get time range from query parameters
        query_params = event.get('queryStringParameters') or {}
        time_range_days = int(query_params.get('timeRange', 30))
        
        # Calculate date filter
        end_date = datetime.now()
        start_date = end_date - timedelta(days=time_range_days)
        start_date_str = start_date.strftime('%Y-%m-%d')
        
        print(f"Analytics for role: {primary_role}, clinic: {user_clinic_id}, timeRange: {time_range_days} days")
        
        # Fetch reports based on role
        reports = []
        
        if primary_role in ['healthcare', 'admin']:
            # Healthcare and admin users see all reports
            response = table.scan()
            reports = response.get('Items', [])
            
            # Handle pagination 
            while 'LastEvaluatedKey' in response:
                response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
                reports.extend(response.get('Items', []))
        
        elif primary_role == 'lab':
            # Lab users only see reports from their clinic
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
            
            # Query by clinic using GSI
            response = table.query(
                IndexName='ClinicIndex',
                KeyConditionExpression=Key('clinic_id').eq(user_clinic_id)
            )
            reports = response.get('Items', [])
        
        else:
            return {
                'statusCode': 403,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({'error': 'Insufficient permissions'})
            }
        
        # Filter reports by date range
        filtered_reports = []
        for report in reports:
            report_date = report.get('timestamp', '')
            if report_date >= start_date_str:
                filtered_reports.append(report)
        
        # Generate analytics
        analytics = generate_analytics(filtered_reports, time_range_days)
        
        # Add metadata
        analytics['metadata'] = {
            'user_role': primary_role,
            'user_clinic': user_clinic_id if primary_role == 'lab' else None,
            'time_range_days': time_range_days,
            'total_reports_in_range': len(filtered_reports),
            'generated_at': datetime.now().isoformat()
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps(analytics, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error generating analytics: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({'error': f'Internal server error: {str(e)}'})
        }

def generate_analytics(reports, time_range_days):
    """Generate comprehensive analytics from the reports data"""
    
    if not reports:
        return {
            'summary': {
                'totalReports': 0,
                'totalPatients': 0,
                'criticalResults': 0,
                'clinicsActive': 0
            },
            'trendsData': [],
            'testTypesData': [],
            'clinicData': [],
            'statusBreakdown': {
                'normal': 0,
                'abnormal': 0,
                'critical': 0
            }
        }
    
    # Initialize counters
    patients = set()
    clinics = set()
    critical_count = 0
    daily_reports = defaultdict(int)
    daily_critical = defaultdict(int)
    test_types = Counter()
    clinic_reports = defaultdict(int)
    clinic_critical = defaultdict(int)
    status_counts = {'normal': 0, 'abnormal': 0, 'critical': 0}
    
    # Process each report
    for report in reports:
       
        patients.add(report.get('patient_id', ''))
        clinic_id = report.get('clinic_id', 'Unknown')
        clinics.add(clinic_id)
        clinic_reports[clinic_id] += 1
        
        # extract date for trends
        report_date = report.get('timestamp', '')[:10]  
        daily_reports[report_date] += 1
        
        # process test results
        test_results = report.get('test_results', [])
        report_has_critical = False
        
        for test in test_results:
            # Count test types
            test_type = test.get('test_type', 'Other')
            test_types[test_type] += 1
            
            # Count status
            status = test.get('status', '').lower()
            is_critical = test.get('critical_flag') == 'Y'
            
            if is_critical:
                status_counts['critical'] += 1
                if not report_has_critical:
                    critical_count += 1
                    clinic_critical[clinic_id] += 1
                    daily_critical[report_date] += 1
                    report_has_critical = True
            elif status in ['high', 'low', 'abnormal']:
                status_counts['abnormal'] += 1
            elif status == 'normal':
                status_counts['normal'] += 1
            else:
               
                status_counts['normal'] += 1
    
    # trends data for the specified time range
    trends_data = []
    end_date = datetime.now().date()
    
    for i in range(time_range_days):
        date = end_date - timedelta(days=time_range_days - 1 - i)
        date_str = date.strftime('%Y-%m-%d')
        trends_data.append({
            'date': date_str,
            'reports': daily_reports.get(date_str, 0),
            'critical': daily_critical.get(date_str, 0)
        })
    
    #  test types data for pie chart
    test_types_data = []
    colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff0000', '#00ffff', '#ff00ff']
    
    for i, (test_type, count) in enumerate(test_types.most_common(8)):
        test_types_data.append({
            'name': test_type,
            'value': count,
            'color': colors[i % len(colors)]
        })
    
    # clinic data for bar chart
    clinic_data = []
    for clinic in sorted(clinic_reports.keys()):
        clinic_data.append({
            'clinic': clinic,
            'reports': clinic_reports[clinic],
            'critical': clinic_critical.get(clinic, 0)
        })
    
    # analytics response
    analytics = {
        'summary': {
            'totalReports': len(reports),
            'totalPatients': len(patients),
            'criticalResults': critical_count,
            'clinicsActive': len(clinics)
        },
        'trendsData': trends_data,
        'testTypesData': test_types_data,
        'clinicData': clinic_data,
        'statusBreakdown': status_counts
    }
    
    return analytics