#!/usr/bin/env python3
"""AWS CDK app for Sikshya-Sathi Cloud Brain infrastructure."""

import aws_cdk as cdk
from stacks.cloud_brain_stack import CloudBrainStack

app = cdk.App()

environment = app.node.try_get_context("environment") or "development"

CloudBrainStack(
    app,
    f"SikshyaSathiCloudBrain-{environment}",
    env=cdk.Environment(
        account=app.node.try_get_context("account"),
        region=app.node.try_get_context("region") or "us-east-1",
    ),
    environment=environment,
)

app.synth()
