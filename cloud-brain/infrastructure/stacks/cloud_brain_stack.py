"""CDK stack for Sikshya-Sathi Cloud Brain."""

from aws_cdk import (
    Stack,
    BundlingOptions,
    BundlingOutput,
    aws_lambda as lambda_,
    aws_apigateway as apigw,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_iam as iam,
    aws_bedrock as bedrock,
    aws_logs as logs,
    aws_cloudwatch as cloudwatch,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
    Duration,
    RemovalPolicy,
    CfnOutput,
    CfnResource,
)
from constructs import Construct


class CloudBrainStack(Stack):
    """Cloud Brain infrastructure stack."""

    def __init__(
        self, scope: Construct, construct_id: str, environment: str, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.env_name = environment

        # DynamoDB Tables
        self.students_table = self._create_students_table()
        self.bundles_table = self._create_bundles_table()
        self.sync_sessions_table = self._create_sync_sessions_table()
        self.knowledge_model_table = self._create_knowledge_model_table()

        # S3 Bucket for learning bundles
        self.bundles_bucket = self._create_bundles_bucket()

        # Bedrock Agent IAM Role
        self.bedrock_agent_role = self._create_bedrock_agent_role()

        # Lambda Functions
        self.mcp_server_handler = self._create_mcp_server_handler()
        
        # Bedrock Agent and Action Groups
        self.bedrock_agent = self._create_bedrock_agent()
        self.mcp_action_group = self._create_mcp_action_group()
        
        # self.content_generation_handler = self._create_content_generation_handler()
        self.sync_upload_handler = self._create_sync_upload_handler()
        self.sync_download_handler = self._create_sync_download_handler()
        self.educator_handler = self._create_educator_handler()
        self.student_handler = self._create_student_handler()

        # API Gateway
        self.api = self._create_api_gateway()

        # Monitoring
        self.alarm_topic = self._create_alarm_topic()
        self._create_cloudwatch_alarms()

        # Outputs
        self._create_outputs()

    def _create_students_table(self) -> dynamodb.Table:
        """Create DynamoDB table for student data."""
        return dynamodb.Table(
            self,
            "StudentsTable",
            table_name=f"sikshya-sathi-students-{self.env_name}",
            partition_key=dynamodb.Attribute(
                name="studentId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN
            if self.env_name == "production"
            else RemovalPolicy.DESTROY,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=self.env_name == "production"
            ),
        )

    def _create_bundles_table(self) -> dynamodb.Table:
        """Create DynamoDB table for bundle metadata."""
        table = dynamodb.Table(
            self,
            "BundlesTable",
            table_name=f"sikshya-sathi-bundles-{self.env_name}",
            partition_key=dynamodb.Attribute(
                name="bundleId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="studentId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN
            if self.env_name == "production"
            else RemovalPolicy.DESTROY,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
        )
        
        # Add GSI to query bundles by studentId
        table.add_global_secondary_index(
            index_name="StudentIdIndex",
            partition_key=dynamodb.Attribute(
                name="studentId", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        
        return table

    def _create_sync_sessions_table(self) -> dynamodb.Table:
        """Create DynamoDB table for sync sessions."""
        table = dynamodb.Table(
            self,
            "SyncSessionsTable",
            table_name=f"sikshya-sathi-sync-sessions-{self.env_name}",
            partition_key=dynamodb.Attribute(
                name="sessionId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN
            if self.env_name == "production"
            else RemovalPolicy.DESTROY,
        )
        
        # Add GSI for querying by student ID
        table.add_global_secondary_index(
            index_name="StudentIdIndex",
            partition_key=dynamodb.Attribute(
                name="studentId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="startTime", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        
        return table

    def _create_knowledge_model_table(self) -> dynamodb.Table:
        """Create DynamoDB table for student knowledge models.
        
        Stores personalized knowledge models tracking student proficiency,
        mastery levels, and learning velocity for adaptive content selection.
        """
        return dynamodb.Table(
            self,
            "KnowledgeModelTable",
            table_name=f"sikshya-sathi-knowledge-models-{self.env_name}",
            partition_key=dynamodb.Attribute(
                name="studentId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN
            if self.env_name == "production"
            else RemovalPolicy.DESTROY,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
        )

    def _create_bundles_bucket(self) -> s3.Bucket:
            """Create S3 bucket for learning bundles."""
            return s3.Bucket(
                self,
                "BundlesBucket",
                bucket_name=f"sikshya-sathi-bundles-{self.env_name}",
                encryption=s3.BucketEncryption.S3_MANAGED,
                versioned=True,  # Enable versioning for all environments
                removal_policy=RemovalPolicy.RETAIN
                if self.env_name == "production"
                else RemovalPolicy.DESTROY,
                auto_delete_objects=self.env_name != "production",
                block_public_access=s3.BlockPublicAccess.BLOCK_ALL,  # Block public access
                lifecycle_rules=[
                    s3.LifecycleRule(
                        id="ExpireOldBundles",
                        enabled=True,
                        expiration=Duration.days(30),  # 30-day expiration
                    )
                ],
            )

    def _create_bedrock_agent_role(self) -> iam.Role:
        """Create IAM role for Bedrock Agent."""
        role = iam.Role(
            self,
            "BedrockAgentRole",
            role_name=f"sikshya-sathi-bedrock-agent-{self.env_name}",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
            description="Role for Sikshya-Sathi Bedrock Agent",
        )

        # Grant Bedrock model invocation permissions
        # Include both direct model access and inference profile access
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=[
                    # Direct model access - all regions
                    f"arn:aws:bedrock:*::foundation-model/*",
                    # Cross-region inference profiles
                    f"arn:aws:bedrock:*:*:inference-profile/*",
                ],
            )
        )

        # Grant AWS Marketplace permissions (required for inference profiles)
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "aws-marketplace:ViewSubscriptions",
                    "aws-marketplace:Subscribe",
                ],
                resources=["*"],
            )
        )

        # Grant access to knowledge bases (for pedagogical best practices)
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:Retrieve",
                    "bedrock:RetrieveAndGenerate",
                ],
                resources=["*"],  # Will be restricted to specific KB ARN
            )
        )

        return role

    def _create_bedrock_agent(self) -> CfnResource:
        """Create Bedrock Agent for curriculum-aligned content generation.
        
        Uses Claude 3.5 Sonnet model with instructions for generating
        personalized learning materials aligned with Nepal K-12 curriculum.
        
        Note: Falls back to environment variables if Bedrock Agent service
        is not available in the current region.
        """
        # Agent instructions for curriculum-aligned content generation
        agent_instructions = """You are an expert educational content generator for Sikshya-Sathi, creating personalized 
learning materials for rural Nepali K-12 students (grades 6-8).

Your responsibilities:
1. Generate lessons aligned with Nepal K-12 curriculum standards
2. Create quizzes assessing understanding at appropriate Bloom's taxonomy levels
3. Provide progressive hints guiding students without revealing answers
4. Use culturally appropriate examples relevant to Nepal
5. Ensure age-appropriate language and complexity
6. Support both Nepali and English languages
7. Incorporate metric system and Nepali currency (NPR) in examples

Before generating content:
- Query MCP Server for curriculum standards using get_curriculum_standards
- Review learning objectives and prerequisites
- Ensure content addresses specified standards

Content structure requirements:
- Lessons: Include explanation, example, and practice sections
- Quizzes: Mix question types (multiple-choice, true/false, short-answer)
- All content: Reference curriculum standard IDs

Always validate your generated content against curriculum standards using the validate_content_alignment tool
to ensure at least 70% alignment score before finalizing."""

        try:
            # Create Bedrock Agent using L1 construct (CfnAgent)
            agent = CfnResource(
                self,
                "BedrockAgent",
                type="AWS::Bedrock::Agent",
                properties={
                    "AgentName": f"sikshya-sathi-content-generator-{self.env_name}",
                    "AgentResourceRoleArn": self.bedrock_agent_role.role_arn,
                    "FoundationModel": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
                    "Instruction": agent_instructions,
                    "Description": "Bedrock Agent for generating curriculum-aligned educational content for Sikshya-Sathi",
                    "IdleSessionTTLInSeconds": 600,  # 10 minutes
                    # Note: PrepareAgent is not supported in CloudFormation, agent will be prepared automatically
                },
            )
            
            # Create Agent Alias for stable endpoint
            self.bedrock_agent_alias = CfnResource(
                self,
                "BedrockAgentAlias",
                type="AWS::Bedrock::AgentAlias",
                properties={
                    "AgentId": agent.get_att("AgentId"),
                    "AgentAliasName": f"sikshya-sathi-alias-{self.env_name}",
                    "Description": "Stable alias for Sikshya-Sathi content generation agent",
                },
            )
            
            return agent
            
        except Exception as e:
            # If Bedrock Agent resources are not available, create a placeholder
            # The Lambda functions will fall back to progressive mock content
            print(f"Warning: Bedrock Agent resources not available: {e}")
            print("Falling back to environment variable configuration for agent IDs")
            
            # Create a dummy resource that won't fail deployment
            # The actual agent configuration will be handled via environment variables
            placeholder = CfnResource(
                self,
                "BedrockAgentPlaceholder",
                type="AWS::CloudFormation::WaitConditionHandle",
                properties={},
            )
            
            # Create a placeholder alias as well
            self.bedrock_agent_alias = CfnResource(
                self,
                "BedrockAgentAliasPlaceholder", 
                type="AWS::CloudFormation::WaitConditionHandle",
                properties={},
            )
            
            return placeholder

    def _create_mcp_action_group(self) -> CfnResource:
        """Create action group connecting Bedrock Agent to MCP Server Lambda.
        
        Exposes four MCP tools:
        - get_curriculum_standards: Query standards by grade and subject
        - get_topic_details: Get detailed topic information
        - validate_content_alignment: Validate content against standards
        - get_learning_progression: Get topic sequence and dependencies
        
        Note: Creates placeholder if Bedrock Agent resources are not available.
        """
        # Grant Bedrock Agent permission to invoke MCP Server Lambda
        self.mcp_server_handler.grant_invoke(self.bedrock_agent_role)
        
        # Check if we have a real Bedrock Agent or placeholder
        if hasattr(self.bedrock_agent, 'get_att') and 'AgentId' in str(self.bedrock_agent.get_att):
            try:
                # Define API schema for the action group
                # This describes the four MCP tools that Bedrock Agent can call
                api_schema = {
                    "openapi": "3.0.0",
                    "info": {
                        "title": "MCP Server Curriculum Tools API",
                        "version": "1.0.0",
                        "description": "API for accessing Nepal K-12 curriculum data and validation tools"
                    },
                    "paths": {
                        "/get_curriculum_standards": {
                            "post": {
                                "summary": "Get curriculum standards for a specific grade and subject",
                                "description": "Returns all curriculum standards with learning objectives, prerequisites, Bloom level, and estimated hours",
                                "operationId": "getCurriculumStandards",
                                "requestBody": {
                                    "required": True,
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "type": "object",
                                                "properties": {
                                                    "grade": {
                                                        "type": "integer",
                                                        "description": "Grade level (6-8)",
                                                        "minimum": 6,
                                                        "maximum": 8
                                                    },
                                                    "subject": {
                                                        "type": "string",
                                                        "description": "Subject name",
                                                        "enum": ["Mathematics", "Science", "Social Studies"]
                                                    }
                                                },
                                                "required": ["grade", "subject"]
                                            }
                                        }
                                    }
                                },
                                "responses": {
                                    "200": {
                                        "description": "List of curriculum standards",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "object"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "/get_topic_details": {
                            "post": {
                                "summary": "Get comprehensive information about a specific curriculum topic",
                                "description": "Returns detailed topic information including assessment criteria, subtopics, and resources",
                                "operationId": "getTopicDetails",
                                "requestBody": {
                                    "required": True,
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "type": "object",
                                                "properties": {
                                                    "topic_id": {
                                                        "type": "string",
                                                        "description": "Unique topic identifier (e.g., MATH-6-001)"
                                                    }
                                                },
                                                "required": ["topic_id"]
                                            }
                                        }
                                    }
                                },
                                "responses": {
                                    "200": {
                                        "description": "Topic details",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "/validate_content_alignment": {
                            "post": {
                                "summary": "Validate generated content alignment with curriculum standards",
                                "description": "Returns alignment score, matched standards, gaps, and recommendations",
                                "operationId": "validateContentAlignment",
                                "requestBody": {
                                    "required": True,
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "type": "object",
                                                "properties": {
                                                    "content": {
                                                        "type": "string",
                                                        "description": "Generated lesson or quiz content"
                                                    },
                                                    "target_standards": {
                                                        "type": "array",
                                                        "items": {
                                                            "type": "string"
                                                        },
                                                        "description": "List of target standard IDs"
                                                    }
                                                },
                                                "required": ["content", "target_standards"]
                                            }
                                        }
                                    }
                                },
                                "responses": {
                                    "200": {
                                        "description": "Content alignment result",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "properties": {
                                                        "alignment_score": {
                                                            "type": "number"
                                                        },
                                                        "matched_standards": {
                                                            "type": "array",
                                                            "items": {
                                                                "type": "string"
                                                            }
                                                        },
                                                        "gaps": {
                                                            "type": "array",
                                                            "items": {
                                                                "type": "string"
                                                            }
                                                        },
                                                        "recommendations": {
                                                            "type": "array",
                                                            "items": {
                                                                "type": "string"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "/get_learning_progression": {
                            "post": {
                                "summary": "Get learning progression showing topic sequence and dependencies",
                                "description": "Returns topic sequence, dependencies, and difficulty progression for a subject and grade range",
                                "operationId": "getLearningProgression",
                                "requestBody": {
                                    "required": True,
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "type": "object",
                                                "properties": {
                                                    "subject": {
                                                        "type": "string",
                                                        "description": "Subject name",
                                                        "enum": ["Mathematics", "Science", "Social Studies"]
                                                    },
                                                    "grade_start": {
                                                        "type": "integer",
                                                        "description": "Starting grade",
                                                        "minimum": 6,
                                                        "maximum": 8
                                                    },
                                                    "grade_end": {
                                                        "type": "integer",
                                                        "description": "Ending grade",
                                                        "minimum": 6,
                                                        "maximum": 8
                                                    }
                                                },
                                                "required": ["subject", "grade_start", "grade_end"]
                                            }
                                        }
                                    }
                                },
                                "responses": {
                                    "200": {
                                        "description": "Learning progression",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                # Create action group using L1 construct (CfnAgentActionGroup)
                action_group = CfnResource(
                    self,
                    "MCPActionGroup",
                    type="AWS::Bedrock::AgentActionGroup",
                    properties={
                        "ActionGroupName": "mcp-curriculum-tools",
                        "AgentId": self.bedrock_agent.get_att("AgentId").to_string(),
                        "AgentVersion": "DRAFT",
                        "Description": "Action group for accessing MCP Server curriculum tools",
                        "ActionGroupExecutor": {
                            "Lambda": self.mcp_server_handler.function_arn
                        },
                        "ApiSchema": {
                            "Payload": str(api_schema)
                        },
                        "ActionGroupState": "ENABLED",
                    },
                )
                
                # Ensure action group is created after agent
                action_group.node.add_dependency(self.bedrock_agent)
                
                return action_group
                
            except Exception as e:
                print(f"Warning: Could not create Bedrock Agent Action Group: {e}")
                # Fall through to placeholder creation
        
        # Create placeholder if Bedrock Agent resources are not available
        print("Creating placeholder for MCP Action Group - MCP Server will be available via direct Lambda invocation")
        placeholder = CfnResource(
            self,
            "MCPActionGroupPlaceholder",
            type="AWS::CloudFormation::WaitConditionHandle",
            properties={},
        )
        
        return placeholder

    def _create_mcp_server_handler(self) -> lambda_.Function:
        """Create Lambda function for MCP Server.
        
        The MCP Server provides curriculum data and validation tools
        for content generation via Bedrock Agent.
        """
        handler = lambda_.Function(
            self,
            "MCPServerHandler",
            function_name=f"sikshya-sathi-mcp-server-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="src.mcp.server.lambda_handler",
            code=lambda_.Code.from_asset(
                "..",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_11.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --only-binary=:all: -r src/requirements.txt -t /asset-output && "
                        "cp -r src /asset-output/",
                    ],
                    output_type=BundlingOutput.AUTO_DISCOVER,
                ),
            ),
            timeout=Duration.seconds(30),
            memory_size=1024,
            architecture=lambda_.Architecture.X86_64,
            environment={
                "ENVIRONMENT": self.env_name,
                "CURRICULUM_DATA_PATH": "/var/task/src/mcp/data",
                "POWERTOOLS_SERVICE_NAME": "mcp-server",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant CloudWatch metrics permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["cloudwatch:PutMetricData"],
                resources=["*"],
            )
        )

        return handler

    def _create_content_generation_handler(self) -> lambda_.Function:
        """Create Lambda function for content generation."""
        handler = lambda_.Function(
            self,
            "ContentGenerationHandler",
            function_name=f"sikshya-sathi-content-gen-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.content_handler.generate",
            code=lambda_.Code.from_asset(
                "../src",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_11.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --only-binary=:all: -r requirements.txt -t /asset-output && "
                        "cp -r . /asset-output",
                    ],
                    output_type=BundlingOutput.AUTO_DISCOVER,
                ),
            ),
            timeout=Duration.seconds(60),
            memory_size=1024,
            architecture=lambda_.Architecture.X86_64,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "KNOWLEDGE_MODEL_TABLE": self.knowledge_model_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "BEDROCK_AGENT_ROLE_ARN": self.bedrock_agent_role.role_arn,
                "BEDROCK_AGENT_ID": self.bedrock_agent.get_att("AgentId").to_string(),
                "BEDROCK_AGENT_ALIAS_ID": self.bedrock_agent_alias.get_att("AgentAliasId").to_string(),
                "POWERTOOLS_SERVICE_NAME": "content-generation",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        self.bundles_table.grant_read_write_data(handler)
        self.knowledge_model_table.grant_read_write_data(handler)
        self.bundles_bucket.grant_read_write(handler)

        # Grant Bedrock Agent invocation permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock-agent-runtime:InvokeAgent",
                    "bedrock-agent:GetAgent",
                    "bedrock-agent:ListAgents",
                ],
                resources=["*"],
            )
        )
        
        # Grant CloudWatch metrics permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["cloudwatch:PutMetricData"],
                resources=["*"],
            )
        )

        return handler

    def _create_sync_upload_handler(self) -> lambda_.Function:
        """Create Lambda function for sync upload."""
        handler = lambda_.Function(
            self,
            "SyncUploadHandler",
            function_name=f"sikshya-sathi-sync-upload-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="src.handlers.sync_handler.upload",
            code=lambda_.Code.from_asset(
                "..",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_11.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --only-binary=:all: -r src/requirements.txt -t /asset-output && "
                        "cp -r src /asset-output/",
                    ],
                    output_type=BundlingOutput.AUTO_DISCOVER,
                ),
            ),
            timeout=Duration.seconds(30),
            memory_size=512,
            architecture=lambda_.Architecture.X86_64,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "SYNC_SESSIONS_TABLE": self.sync_sessions_table.table_name,
                "KNOWLEDGE_MODEL_TABLE": self.knowledge_model_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "JWT_SECRET": "dev-secret-change-in-production",  # TODO: Use Secrets Manager
                "POWERTOOLS_SERVICE_NAME": "sync-upload",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
                # Bedrock Agent configuration - will be set to actual values if agent is created
                "BEDROCK_AGENT_ID": self._get_bedrock_agent_id_for_env(),
                "BEDROCK_AGENT_ALIAS_ID": self._get_bedrock_agent_alias_id_for_env(),
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        self.bundles_table.grant_read_write_data(handler)
        self.sync_sessions_table.grant_read_write_data(handler)
        self.knowledge_model_table.grant_read_write_data(handler)
        
        # Grant Bedrock Agent invocation permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock-agent-runtime:InvokeAgent",
                    "bedrock-agent:GetAgent",
                    "bedrock-agent:ListAgents",
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=["*"],
            )
        )
        
        # Grant CloudWatch metrics permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["cloudwatch:PutMetricData"],
                resources=["*"],
            )
        )

        return handler

    def _create_sync_download_handler(self) -> lambda_.Function:
        """Create Lambda function for sync download."""
        handler = lambda_.Function(
            self,
            "SyncDownloadHandler",
            function_name=f"sikshya-sathi-sync-download-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="src.handlers.sync_handler.download",
            code=lambda_.Code.from_asset(
                "..",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_11.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --only-binary=:all: -r src/requirements.txt -t /asset-output && "
                        "cp -r src /asset-output/",
                    ],
                    output_type=BundlingOutput.AUTO_DISCOVER,
                ),
            ),
            timeout=Duration.seconds(60),
            memory_size=1024,
            architecture=lambda_.Architecture.X86_64,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "SYNC_SESSIONS_TABLE": self.sync_sessions_table.table_name,
                "KNOWLEDGE_MODEL_TABLE": self.knowledge_model_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "JWT_SECRET": "dev-secret-change-in-production",  # TODO: Use Secrets Manager
                "POWERTOOLS_SERVICE_NAME": "sync-download",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        self.bundles_table.grant_read_write_data(handler)
        self.sync_sessions_table.grant_read_write_data(handler)
        self.knowledge_model_table.grant_read_write_data(handler)
        self.bundles_bucket.grant_read_write(handler)
        
        # Grant CloudWatch metrics permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["cloudwatch:PutMetricData"],
                resources=["*"],
            )
        )

        return handler

    def _create_educator_handler(self) -> lambda_.Function:
        """Create Lambda function for educator dashboard and tools."""
        handler = lambda_.Function(
            self,
            "EducatorHandler",
            function_name=f"sikshya-sathi-educator-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="src.handlers.educator_handler.lambda_handler",
            code=lambda_.Code.from_asset(
                "..",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_11.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --only-binary=:all: -r src/requirements.txt -t /asset-output && "
                        "cp -r src /asset-output/",
                    ],
                    output_type=BundlingOutput.AUTO_DISCOVER,
                ),
            ),
            timeout=Duration.seconds(30),
            memory_size=512,
            architecture=lambda_.Architecture.X86_64,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "SYNC_SESSIONS_TABLE": self.sync_sessions_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "JWT_SECRET": "dev-secret-change-in-production",  # TODO: Use Secrets Manager
                "POWERTOOLS_SERVICE_NAME": "educator",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        self.bundles_table.grant_read_write_data(handler)
        self.sync_sessions_table.grant_read_write_data(handler)
        
        # Grant CloudWatch metrics permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["cloudwatch:PutMetricData"],
                resources=["*"],
            )
        )

        return handler

    def _create_student_handler(self) -> lambda_.Function:
        """Create Lambda function for student registration."""
        handler = lambda_.Function(
            self,
            "StudentHandler",
            function_name=f"sikshya-sathi-student-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="src.handlers.student_handler.register",
            code=lambda_.Code.from_asset(
                "..",
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_11.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install --platform manylinux2014_x86_64 --only-binary=:all: -r src/requirements.txt -t /asset-output && "
                        "cp -r src /asset-output/",
                    ],
                    output_type=BundlingOutput.AUTO_DISCOVER,
                ),
            ),
            timeout=Duration.seconds(10),
            memory_size=256,
            architecture=lambda_.Architecture.X86_64,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "POWERTOOLS_SERVICE_NAME": "student-registration",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        
        # Grant CloudWatch metrics permissions
        handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["cloudwatch:PutMetricData"],
                resources=["*"],
            )
        )

        return handler

    def _create_api_gateway(self) -> apigw.RestApi:
        """Create API Gateway for sync endpoints."""
        api = apigw.RestApi(
            self,
            "SyncApi",
            rest_api_name=f"sikshya-sathi-api-{self.env_name}",
            description="Sikshya-Sathi Cloud Brain Sync API",
            deploy_options=apigw.StageOptions(
                stage_name=self.env_name,
                throttling_rate_limit=100,
                throttling_burst_limit=200,
                logging_level=apigw.MethodLoggingLevel.INFO,
                data_trace_enabled=True,
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
                max_age=Duration.hours(1),
            ),
        )

        # /sync resource - enables mobile app sync functionality
        sync = api.root.add_resource("sync")

        # POST /sync/upload - Upload performance logs and trigger bundle generation
        upload = sync.add_resource("upload")
        upload.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.sync_upload_handler,
                proxy=True,
            ),
            request_validator=apigw.RequestValidator(
                self,
                "UploadRequestValidator",
                rest_api=api,
                validate_request_body=True,
                validate_request_parameters=False,
            ),
        )

        # GET /sync/download/{sessionId} - Download personalized learning bundle
        download = sync.add_resource("download")
        session = download.add_resource("{sessionId}")
        session.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.sync_download_handler,
                proxy=True,
            ),
        )

        # GET /health (no authentication required)
        health = api.root.add_resource("health")
        health.add_method(
            "GET",
            apigw.MockIntegration(
                integration_responses=[
                    apigw.IntegrationResponse(
                        status_code="200",
                        response_templates={
                            "application/json": '{"status": "healthy", "version": "1.0.0"}'
                        },
                    )
                ],
                request_templates={"application/json": '{"statusCode": 200}'},
            ),
            method_responses=[apigw.MethodResponse(status_code="200")],
        )

        # /api resource
        api_resource = api.root.add_resource("api")
        
        # /api/students resource
        students = api_resource.add_resource("students")
        
        # POST /api/students/register
        register = students.add_resource("register")
        register.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.student_handler,
                proxy=True,
            ),
            request_validator=apigw.RequestValidator(
                self,
                "StudentRegistrationValidator",
                rest_api=api,
                validate_request_body=True,
                validate_request_parameters=False,
            ),
        )

        # /educator resource
        educator = api.root.add_resource("educator")
        
        # GET /educator/dashboard
        dashboard = educator.add_resource("dashboard")
        dashboard.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # GET /educator/students
        educator_students = educator.add_resource("students")
        educator_students.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # GET /educator/student-progress
        student_progress = educator.add_resource("student-progress")
        student_progress.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # GET /educator/class-report
        class_report = educator.add_resource("class-report")
        class_report.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # GET /educator/curriculum-coverage
        curriculum_coverage = educator.add_resource("curriculum-coverage")
        curriculum_coverage.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # POST /educator/assign-topics
        assign_topics = educator.add_resource("assign-topics")
        assign_topics.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # POST /educator/customize-track
        customize_track = educator.add_resource("customize-track")
        customize_track.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # GET /educator/assignments
        assignments = educator.add_resource("assignments")
        assignments.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # GET /educator/review-queue
        review_queue = educator.add_resource("review-queue")
        review_queue.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )
        
        # POST /educator/review-content
        review_content = educator.add_resource("review-content")
        review_content.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.educator_handler,
                proxy=True,
            ),
        )

        return api

    def _create_alarm_topic(self) -> sns.Topic:
        """Create SNS topic for CloudWatch alarms."""
        return sns.Topic(
            self,
            "AlarmTopic",
            topic_name=f"sikshya-sathi-alarms-{self.env_name}",
            display_name="Sikshya-Sathi Cloud Brain Alarms",
        )

    def _create_cloudwatch_alarms(self) -> None:
        """Create CloudWatch alarms for critical errors and performance."""
        namespace = "SikshyaSathi/CloudBrain"
        
        # Alarms for disabled handlers - commented out
        # # Alarm for content generation latency (p95 > 60 seconds)
        # content_gen_latency_alarm = cloudwatch.Alarm(
        #     self,
        #     "ContentGenerationLatencyAlarm",
        #     alarm_name=f"sikshya-sathi-content-gen-latency-{self.env_name}",
        #     alarm_description="Content generation latency exceeds 60 seconds (p95)",
        #     metric=cloudwatch.Metric(
        #         namespace=namespace,
        #         metric_name="ContentGenerationLatency",
        #         statistic="p95",
        #         period=Duration.minutes(5),
        #     ),
        #     threshold=60000,  # 60 seconds in milliseconds
        #     evaluation_periods=2,
        #     comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        #     treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        # )
        # content_gen_latency_alarm.add_alarm_action(
        #     cw_actions.SnsAction(self.alarm_topic)
        # )
        
        # # Alarm for validation success rate (< 95%)
        # validation_success_alarm = cloudwatch.Alarm(
        #     self,
        #     "ValidationSuccessRateAlarm",
        #     alarm_name=f"sikshya-sathi-validation-success-{self.env_name}",
        #     alarm_description="Content validation success rate below 95%",
        #     metric=cloudwatch.Metric(
        #         namespace=namespace,
        #         metric_name="ValidationSuccessRate",
        #         statistic="Average",
        #         period=Duration.minutes(5),
        #     ),
        #     threshold=95,
        #     evaluation_periods=2,
        #     comparison_operator=cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        #     treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        # )
        # validation_success_alarm.add_alarm_action(
        #     cw_actions.SnsAction(self.alarm_topic)
        # )
        
        # # Alarm for sync completion rate (< 90%)
        # sync_completion_alarm = cloudwatch.Alarm(
        #     self,
        #     "SyncCompletionRateAlarm",
        #     alarm_name=f"sikshya-sathi-sync-completion-{self.env_name}",
        #     alarm_description="Sync completion rate below 90%",
        #     metric=cloudwatch.Metric(
        #         namespace=namespace,
        #         metric_name="SyncCompletionRate",
        #         statistic="Average",
        #         period=Duration.minutes(5),
        #     ),
        #     threshold=90,
        #     evaluation_periods=2,
        #     comparison_operator=cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        #     treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        # )
        # sync_completion_alarm.add_alarm_action(
        #     cw_actions.SnsAction(self.alarm_topic)
        # )
        
        # # Alarm for Lambda errors (content generation)
        # content_gen_error_alarm = cloudwatch.Alarm(
        #     self,
        #     "ContentGenerationErrorAlarm",
        #     alarm_name=f"sikshya-sathi-content-gen-errors-{self.env_name}",
        #     alarm_description="Content generation Lambda errors",
        #     metric=self.content_generation_handler.metric_errors(
        #         period=Duration.minutes(5),
        #     ),
        #     threshold=5,
        #     evaluation_periods=1,
        #     comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        #     treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        # )
        # content_gen_error_alarm.add_alarm_action(
        #     cw_actions.SnsAction(self.alarm_topic)
        # )
        
        # # Alarm for Lambda errors (sync upload)
        # sync_upload_error_alarm = cloudwatch.Alarm(
        #     self,
        #     "SyncUploadErrorAlarm",
        #     alarm_name=f"sikshya-sathi-sync-upload-errors-{self.env_name}",
        #     alarm_description="Sync upload Lambda errors",
        #     metric=self.sync_upload_handler.metric_errors(
        #         period=Duration.minutes(5),
        #     ),
        #     threshold=5,
        #     evaluation_periods=1,
        #     comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        #     treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        # )
        # sync_upload_error_alarm.add_alarm_action(
        #     cw_actions.SnsAction(self.alarm_topic)
        # )
        
        # # Alarm for Lambda errors (sync download)
        # sync_download_error_alarm = cloudwatch.Alarm(
        #     self,
        #     "SyncDownloadErrorAlarm",
        #     alarm_name=f"sikshya-sathi-sync-download-errors-{self.env_name}",
        #     alarm_description="Sync download Lambda errors",
        #     metric=self.sync_download_handler.metric_errors(
        #         period=Duration.minutes(5),
        #     ),
        #     threshold=5,
        #     evaluation_periods=1,
        #     comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        #     treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        # )
        # sync_download_error_alarm.add_alarm_action(
        #     cw_actions.SnsAction(self.alarm_topic)
        # )
        
        # Alarm for DynamoDB students table throttling
        students_table_throttle_alarm = cloudwatch.Alarm(
            self,
            "StudentsTableThrottleAlarm",
            alarm_name=f"sikshya-sathi-students-table-throttle-{self.env_name}",
            alarm_description="Students table experiencing throttling",
            metric=cloudwatch.Metric(
                namespace="AWS/DynamoDB",
                metric_name="UserErrors",
                dimensions_map={
                    "TableName": self.students_table.table_name,
                },
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=10,
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        students_table_throttle_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for DynamoDB students table system errors
        students_table_system_error_alarm = cloudwatch.Alarm(
            self,
            "StudentsTableSystemErrorAlarm",
            alarm_name=f"sikshya-sathi-students-table-system-errors-{self.env_name}",
            alarm_description="Students table experiencing system errors",
            metric=cloudwatch.Metric(
                namespace="AWS/DynamoDB",
                metric_name="SystemErrors",
                dimensions_map={
                    "TableName": self.students_table.table_name,
                },
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        students_table_system_error_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for student registration errors
        student_registration_error_alarm = cloudwatch.Alarm(
            self,
            "StudentRegistrationErrorAlarm",
            alarm_name=f"sikshya-sathi-student-registration-errors-{self.env_name}",
            alarm_description="Student registration Lambda errors",
            metric=self.student_handler.metric_errors(
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        student_registration_error_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for student registration latency (p95 > 1000ms)
        student_registration_latency_alarm = cloudwatch.Alarm(
            self,
            "StudentRegistrationLatencyAlarm",
            alarm_name=f"sikshya-sathi-student-registration-latency-{self.env_name}",
            alarm_description="Student registration latency exceeds 1000ms (p95)",
            metric=cloudwatch.Metric(
                namespace=namespace,
                metric_name="StudentRegistrationLatency",
                statistic="p95",
                period=Duration.minutes(5),
            ),
            threshold=1000,  # 1 second in milliseconds
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        student_registration_latency_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )

    def _create_outputs(self) -> None:
        """Create CloudFormation outputs."""
        CfnOutput(
            self,
            "MCPServerLambdaArn",
            value=self.mcp_server_handler.function_arn,
            description="Lambda function ARN for MCP Server",
            export_name=f"sikshya-sathi-mcp-server-arn-{self.env_name}",
        )

        CfnOutput(
            self,
            "BedrockAgentRoleArn",
            value=self.bedrock_agent_role.role_arn,
            description="IAM Role ARN for Bedrock Agent",
            export_name=f"sikshya-sathi-bedrock-role-{self.env_name}",
        )
        
        # Only create agent outputs if we have real Bedrock Agent resources
        try:
            if hasattr(self.bedrock_agent, 'get_att') and 'AgentId' in str(self.bedrock_agent.get_att):
                CfnOutput(
                    self,
                    "BedrockAgentId",
                    value=self.bedrock_agent.get_att("AgentId").to_string(),
                    description="Bedrock Agent ID for content generation",
                    export_name=f"sikshya-sathi-bedrock-agent-id-{self.env_name}",
                )
                
                CfnOutput(
                    self,
                    "BedrockAgentAliasId",
                    value=self.bedrock_agent_alias.get_att("AgentAliasId").to_string(),
                    description="Bedrock Agent Alias ID for stable endpoint",
                    export_name=f"sikshya-sathi-bedrock-agent-alias-id-{self.env_name}",
                )
            else:
                # Create placeholder outputs for environment variable configuration
                CfnOutput(
                    self,
                    "BedrockAgentId",
                    value="CONFIGURE_VIA_ENVIRONMENT_VARIABLE",
                    description="Bedrock Agent ID - configure via BEDROCK_AGENT_ID environment variable",
                    export_name=f"sikshya-sathi-bedrock-agent-id-{self.env_name}",
                )
                
                CfnOutput(
                    self,
                    "BedrockAgentAliasId",
                    value="CONFIGURE_VIA_ENVIRONMENT_VARIABLE",
                    description="Bedrock Agent Alias ID - configure via BEDROCK_AGENT_ALIAS_ID environment variable",
                    export_name=f"sikshya-sathi-bedrock-agent-alias-id-{self.env_name}",
                )
        except Exception as e:
            print(f"Warning: Could not create Bedrock Agent outputs: {e}")
            # Create placeholder outputs
            CfnOutput(
                self,
                "BedrockAgentId",
                value="CONFIGURE_VIA_ENVIRONMENT_VARIABLE",
                description="Bedrock Agent ID - configure via BEDROCK_AGENT_ID environment variable",
                export_name=f"sikshya-sathi-bedrock-agent-id-{self.env_name}",
            )
            
            CfnOutput(
                self,
                "BedrockAgentAliasId",
                value="CONFIGURE_VIA_ENVIRONMENT_VARIABLE",
                description="Bedrock Agent Alias ID - configure via BEDROCK_AGENT_ALIAS_ID environment variable",
                export_name=f"sikshya-sathi-bedrock-agent-alias-id-{self.env_name}",
            )

        CfnOutput(
            self,
            "ApiEndpoint",
            value=self.api.url,
            description="API Gateway endpoint URL",
            export_name=f"sikshya-sathi-api-url-{self.env_name}",
        )

        CfnOutput(
            self,
            "BundlesBucketName",
            value=self.bundles_bucket.bucket_name,
            description="S3 bucket for learning bundles",
            export_name=f"sikshya-sathi-bundles-bucket-{self.env_name}",
        )

        CfnOutput(
            self,
            "AlarmTopicArn",
            value=self.alarm_topic.topic_arn,
            description="SNS topic ARN for CloudWatch alarms",
            export_name=f"sikshya-sathi-alarm-topic-{self.env_name}",
        )

    def _get_bedrock_agent_id_for_env(self) -> str:
        """Get Bedrock Agent ID for environment variables."""
        try:
            if hasattr(self.bedrock_agent, 'get_att') and 'AgentId' in str(self.bedrock_agent.get_att):
                return self.bedrock_agent.get_att("AgentId").to_string()
            else:
                return ""  # Empty string will cause BedrockAgentService to fall back to mock content
        except Exception:
            return ""  # Empty string will cause BedrockAgentService to fall back to mock content

    def _get_bedrock_agent_alias_id_for_env(self) -> str:
        """Get Bedrock Agent Alias ID for environment variables."""
        try:
            if hasattr(self.bedrock_agent_alias, 'get_att') and 'AgentAliasId' in str(self.bedrock_agent_alias.get_att):
                return self.bedrock_agent_alias.get_att("AgentAliasId").to_string()
            else:
                return "TSTALIASID"  # Default alias ID
        except Exception:
            return "TSTALIASID"  # Default alias ID
