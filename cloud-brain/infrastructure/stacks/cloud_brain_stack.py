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

        # S3 Bucket for learning bundles
        self.bundles_bucket = self._create_bundles_bucket()

        # Bedrock Agent IAM Role
        self.bedrock_agent_role = self._create_bedrock_agent_role()

        # Bedrock Agent (Note: Agent creation is done via API, not CDK)
        # The role ARN is exported for use in agent creation

        # Lambda Functions
        self.content_generation_handler = self._create_content_generation_handler()
        self.sync_upload_handler = self._create_sync_upload_handler()
        self.sync_download_handler = self._create_sync_download_handler()

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
        return dynamodb.Table(
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
        )

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

    def _create_bundles_bucket(self) -> s3.Bucket:
        """Create S3 bucket for learning bundles."""
        return s3.Bucket(
            self,
            "BundlesBucket",
            bucket_name=f"sikshya-sathi-bundles-{self.env_name}",
            encryption=s3.BucketEncryption.S3_MANAGED,
            versioned=self.env_name == "production",
            removal_policy=RemovalPolicy.RETAIN
            if self.env_name == "production"
            else RemovalPolicy.DESTROY,
            auto_delete_objects=self.env_name != "production",
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

    def _create_content_generation_handler(self) -> lambda_.Function:
        """Create Lambda function for content generation."""
        # Create log group with retention
        log_group = logs.LogGroup(
            self,
            "ContentGenerationLogGroup",
            log_group_name=f"/aws/lambda/sikshya-sathi-content-gen-{self.env_name}",
            retention=logs.RetentionDays.ONE_MONTH
            if self.env_name == "production"
            else logs.RetentionDays.ONE_WEEK,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
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
            log_retention=logs.RetentionDays.ONE_MONTH
            if self.env_name == "production"
            else logs.RetentionDays.ONE_WEEK,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "BEDROCK_AGENT_ROLE_ARN": self.bedrock_agent_role.role_arn,
                "POWERTOOLS_SERVICE_NAME": "content-generation",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        self.bundles_table.grant_read_write_data(handler)
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
        # Create log group with retention
        log_group = logs.LogGroup(
            self,
            "SyncUploadLogGroup",
            log_group_name=f"/aws/lambda/sikshya-sathi-sync-upload-{self.env_name}",
            retention=logs.RetentionDays.ONE_MONTH
            if self.env_name == "production"
            else logs.RetentionDays.ONE_WEEK,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        handler = lambda_.Function(
            self,
            "SyncUploadHandler",
            function_name=f"sikshya-sathi-sync-upload-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.sync_handler.upload",
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
            timeout=Duration.seconds(30),
            memory_size=512,
            architecture=lambda_.Architecture.X86_64,
            log_retention=logs.RetentionDays.ONE_MONTH
            if self.env_name == "production"
            else logs.RetentionDays.ONE_WEEK,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "SYNC_SESSIONS_TABLE": self.sync_sessions_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "JWT_SECRET": "dev-secret-change-in-production",  # TODO: Use Secrets Manager
                "POWERTOOLS_SERVICE_NAME": "sync-upload",
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

    def _create_sync_download_handler(self) -> lambda_.Function:
        """Create Lambda function for sync download."""
        # Create log group with retention
        log_group = logs.LogGroup(
            self,
            "SyncDownloadLogGroup",
            log_group_name=f"/aws/lambda/sikshya-sathi-sync-download-{self.env_name}",
            retention=logs.RetentionDays.ONE_MONTH
            if self.env_name == "production"
            else logs.RetentionDays.ONE_WEEK,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        handler = lambda_.Function(
            self,
            "SyncDownloadHandler",
            function_name=f"sikshya-sathi-sync-download-{self.env_name}",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.sync_handler.download",
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
            log_retention=logs.RetentionDays.ONE_MONTH
            if self.env_name == "production"
            else logs.RetentionDays.ONE_WEEK,
            environment={
                "ENVIRONMENT": self.env_name,
                "STUDENTS_TABLE": self.students_table.table_name,
                "BUNDLES_TABLE": self.bundles_table.table_name,
                "SYNC_SESSIONS_TABLE": self.sync_sessions_table.table_name,
                "BUNDLES_BUCKET": self.bundles_bucket.bucket_name,
                "JWT_SECRET": "dev-secret-change-in-production",  # TODO: Use Secrets Manager
                "BEDROCK_AGENT_ROLE_ARN": self.bedrock_agent_role.role_arn,
                "POWERTOOLS_SERVICE_NAME": "sync-download",
                "POWERTOOLS_METRICS_NAMESPACE": "SikshyaSathi/CloudBrain",
                "LOG_LEVEL": "INFO" if self.env_name == "production" else "DEBUG",
            },
        )

        # Grant permissions
        self.students_table.grant_read_write_data(handler)
        self.bundles_table.grant_read_write_data(handler)
        self.sync_sessions_table.grant_read_write_data(handler)
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
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
        )

        # /sync resource
        sync = api.root.add_resource("sync")

        # POST /sync/upload (requires authentication)
        upload = sync.add_resource("upload")
        upload.add_method(
            "POST",
            apigw.LambdaIntegration(
                self.sync_upload_handler,
                proxy=True,
            ),
            authorization_type=apigw.AuthorizationType.CUSTOM,
            request_validator=apigw.RequestValidator(
                self,
                "UploadRequestValidator",
                rest_api=api,
                validate_request_body=True,
                validate_request_parameters=False,
            ),
        )

        # GET /sync/download/{sessionId} (requires authentication)
        download = sync.add_resource("download")
        session = download.add_resource("{sessionId}")
        session.add_method(
            "GET",
            apigw.LambdaIntegration(
                self.sync_download_handler,
                proxy=True,
            ),
            authorization_type=apigw.AuthorizationType.CUSTOM,
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
        
        # Alarm for content generation latency (p95 > 60 seconds)
        content_gen_latency_alarm = cloudwatch.Alarm(
            self,
            "ContentGenerationLatencyAlarm",
            alarm_name=f"sikshya-sathi-content-gen-latency-{self.env_name}",
            alarm_description="Content generation latency exceeds 60 seconds (p95)",
            metric=cloudwatch.Metric(
                namespace=namespace,
                metric_name="ContentGenerationLatency",
                statistic="p95",
                period=Duration.minutes(5),
            ),
            threshold=60000,  # 60 seconds in milliseconds
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        content_gen_latency_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for validation success rate (< 95%)
        validation_success_alarm = cloudwatch.Alarm(
            self,
            "ValidationSuccessRateAlarm",
            alarm_name=f"sikshya-sathi-validation-success-{self.env_name}",
            alarm_description="Content validation success rate below 95%",
            metric=cloudwatch.Metric(
                namespace=namespace,
                metric_name="ValidationSuccessRate",
                statistic="Average",
                period=Duration.minutes(5),
            ),
            threshold=95,
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        validation_success_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for sync completion rate (< 90%)
        sync_completion_alarm = cloudwatch.Alarm(
            self,
            "SyncCompletionRateAlarm",
            alarm_name=f"sikshya-sathi-sync-completion-{self.env_name}",
            alarm_description="Sync completion rate below 90%",
            metric=cloudwatch.Metric(
                namespace=namespace,
                metric_name="SyncCompletionRate",
                statistic="Average",
                period=Duration.minutes(5),
            ),
            threshold=90,
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        sync_completion_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for Lambda errors (content generation)
        content_gen_error_alarm = cloudwatch.Alarm(
            self,
            "ContentGenerationErrorAlarm",
            alarm_name=f"sikshya-sathi-content-gen-errors-{self.env_name}",
            alarm_description="Content generation Lambda errors",
            metric=self.content_generation_handler.metric_errors(
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        content_gen_error_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for Lambda errors (sync upload)
        sync_upload_error_alarm = cloudwatch.Alarm(
            self,
            "SyncUploadErrorAlarm",
            alarm_name=f"sikshya-sathi-sync-upload-errors-{self.env_name}",
            alarm_description="Sync upload Lambda errors",
            metric=self.sync_upload_handler.metric_errors(
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        sync_upload_error_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )
        
        # Alarm for Lambda errors (sync download)
        sync_download_error_alarm = cloudwatch.Alarm(
            self,
            "SyncDownloadErrorAlarm",
            alarm_name=f"sikshya-sathi-sync-download-errors-{self.env_name}",
            alarm_description="Sync download Lambda errors",
            metric=self.sync_download_handler.metric_errors(
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        sync_download_error_alarm.add_alarm_action(
            cw_actions.SnsAction(self.alarm_topic)
        )

    def _create_outputs(self) -> None:
        """Create CloudFormation outputs."""
        CfnOutput(
            self,
            "BedrockAgentRoleArn",
            value=self.bedrock_agent_role.role_arn,
            description="IAM Role ARN for Bedrock Agent",
            export_name=f"sikshya-sathi-bedrock-role-{self.env_name}",
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
