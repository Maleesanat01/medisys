import os
import boto3
import json
import secrets
import string

def handler(event, context):
    # CORS headers that must be included in ALL responses
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent,X-Amzn-Trace-Id',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
        'Access-Control-Allow-Credentials': 'false',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight OPTIONS request debugging
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'message': 'CORS preflight'})
        }
    
  
    print("=" * 80)
    print("FULL EVENT RECEIVED:")
    print(json.dumps(event, default=str, indent=2))
    print("=" * 80)
    
    # Check if user is admin
    try:
        # Get user groups from the JWT token claims
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        claims = authorizer.get('claims', {})
        
        print(f"REQUEST CONTEXT KEYS: {list(request_context.keys())}")
        print(f"AUTHORIZER KEYS: {list(authorizer.keys())}")
        print(f"CLAIMS KEYS: {list(claims.keys())}")
        print(f"FULL CLAIMS: {json.dumps(claims, default=str, indent=2)}")
        
      
        user_groups = None
        groups_list = []
        
        # Method 1: Direct cognito:groups
        if 'cognito:groups' in claims:
            user_groups = claims['cognito:groups']
            print(f"Found groups via 'cognito:groups': {user_groups}")
        
        # Method 2: Check all keys for group-related data
        for key, value in claims.items():
            print(f"CLAIM: {key} = {value} (type: {type(value)})")
            if 'group' in key.lower():
                print(f"POTENTIAL GROUPS KEY: {key} = {value}")
                user_groups = value
        
        # Method 3: Check if groups are in a different part of the event
        if not user_groups:
        
            print("Checking other locations for groups...")
            
          
            auth_keys = ['authorizer', 'claims', 'principalId', 'context']
            for key in auth_keys:
                if key in request_context:
                    print(f"Found {key} in requestContext: {request_context[key]}")
        
      
        if user_groups:
            if isinstance(user_groups, str):
                if user_groups:
                    groups_list = [g.strip() for g in user_groups.split(',') if g.strip()]
                else:
                    groups_list = []
            elif isinstance(user_groups, list):
                groups_list = user_groups
            else:
                groups_list = []
        
        print(f"FINAL PARSED GROUPS: {groups_list}")
        
       
        username = claims.get('cognito:username', 'unknown')
        email = claims.get('email', 'unknown')
        sub = claims.get('sub', 'unknown')
        
        print(f"USER INFO - Username: {username}, Email: {email}, Sub: {sub}")
        
      
        is_admin = False
        if groups_list:
            is_admin = any(group.lower() == 'admin' for group in groups_list)
        
        print(f"IS_ADMIN CHECK: {is_admin}")
        
       
        custom_role = claims.get('custom:role', '')
        print(f"CUSTOM ROLE: {custom_role}")
        
       
        is_admin_final = is_admin or (custom_role.lower() == 'admin')
        print(f"FINAL ADMIN CHECK: {is_admin_final}")
        
        if not is_admin_final:
            
            return {
                'statusCode': 403,
                'headers': cors_headers,
                'body': json.dumps({
                    'error': 'Access denied. Admin privileges required.',
                    'debug': {
                        'userGroups': groups_list,
                        'username': username,
                        'email': email,
                        'customRole': custom_role,
                        'claimsKeys': list(claims.keys()),
                        'rawGroups': user_groups,
                        'parsedGroups': groups_list,
                        'allClaims': claims,  
                        'requestContextKeys': list(request_context.keys()),
                        'authorizerKeys': list(authorizer.keys()) if authorizer else []
                    }
                })
            }
    except Exception as e:
        print(f"ERROR DURING AUTHORIZATION CHECK: {str(e)}")
        import traceback
        print(f"FULL TRACEBACK: {traceback.format_exc()}")
        
       
        return {
            'statusCode': 401,
            'headers': cors_headers,
            'body': json.dumps({
                'error': 'Unauthorized. Unable to verify admin privileges.',
                'debug': {
                    'errorMessage': str(e),
                    'errorType': str(type(e)),
                    'eventKeys': list(event.keys()) if event else [],
                    'requestContextExists': 'requestContext' in event if event else False
                }
            })
        }
    
    cognito = boto3.client('cognito-idp')
    
    try:
       
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        print(f"REQUEST BODY: {body}")
        
        # Validate required fields
        required_fields = ['email', 'name', 'role']
        for field in required_fields:
            if not body.get(field):
                return {
                    'statusCode': 400,
                    'headers': cors_headers,
                    'body': json.dumps({'error': f'Missing required field: {field}'})
                }
        
       
        valid_roles = ['lab', 'healthcare', 'admin']
        if body['role'] not in valid_roles:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': f'Invalid role. Must be one of: {valid_roles}'})
            }
        
       
        temp_password = generate_temp_password()
        
        # Prepare user attributes
        user_attributes = [
            {'Name': 'email', 'Value': body['email']},
            {'Name': 'email_verified', 'Value': 'true'},
            {'Name': 'given_name', 'Value': body['name']},
            {'Name': 'custom:role', 'Value': body['role']}
        ]
        
        
        if body.get('clinic_id'):
            user_attributes.append({'Name': 'custom:clinic_id', 'Value': body['clinic_id']})
        elif body['role'] == 'lab':
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'clinic_id is required for lab users'})
            }
        
        print(f"CREATING USER WITH ATTRIBUTES: {user_attributes}")
        
        # Create user in Cognito
        response = cognito.admin_create_user(
            UserPoolId=os.environ['USER_POOL_ID'],
            Username=body['email'],
            UserAttributes=user_attributes,
            TemporaryPassword=temp_password,
            MessageAction='SUPPRESS', 
            DesiredDeliveryMediums=['EMAIL']
        )
        
        print(f"USER CREATED SUCCESSFULLY: {response}")
        
        # Set password to require reset on first login
        cognito.admin_set_user_password(
            UserPoolId=os.environ['USER_POOL_ID'],
            Username=body['email'],
            Password=temp_password,
            Permanent=False
        )
        
        # Add user to group
        try:
            cognito.admin_add_user_to_group(
                UserPoolId=os.environ['USER_POOL_ID'],
                Username=body['email'],
                GroupName=body['role']
            )
            print(f"USER ADDED TO GROUP: {body['role']}")
        except Exception as e:
            print(f"WARNING: Could not add user to group {body['role']}: {str(e)}")
        
        # Return success response 
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'message': 'User created successfully',
                'username': body['email'],
                'temporaryPassword': temp_password,
                'userSub': response['User']['Username']
            })
        }
        
    except cognito.exceptions.UsernameExistsException:
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'error': 'User with this email already exists'})
        }
    except Exception as e:
        print(f"ERROR CREATING USER: {str(e)}")
        import traceback
        print(f"FULL TRACEBACK: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({
                'error': f'Internal server error: {str(e)}',
                'type': str(type(e))
            })
        }

def generate_temp_password():
    """Generate a secure 12-character temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(12))
        if (any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in "!@#$%^&*" for c in password)):
            return password