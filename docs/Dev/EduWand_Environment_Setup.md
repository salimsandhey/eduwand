# EduWand Platform — Environment Setup
**Enrolment Growth Engine and AI Module**
Prepared by Fovea Infotech | Version 1 | Confidential

---

## 1. Overview

This document lists the environment configuration needed before development starts. Values marked as placeholders must be filled in with real values from your AWS and Bedrock accounts before the application can run. Keep actual secrets out of source control, use a secrets manager or environment variables injected at deploy time.

## 2. AWS Account and Access

| Item | Placeholder | Notes |
|---|---|---|
| AWS Account ID | `[fill in]` | |
| Region | `ap-south-1` | Mumbai, per the infrastructure Statement of Work |
| IAM user or role for deployment | `[fill in]` | Scoped access, not root account credentials |
| VPC ID | `[fill in]` | As provisioned per the Statement of Work |

## 3. Compute

| Server | Placeholder | Notes |
|---|---|---|
| LF-APP-01 endpoint | `[fill in]` | Behind load balancer |
| LF-APP-02 endpoint | `[fill in]` | Behind load balancer |
| LF-WORKER-01 endpoint | `[fill in]` | Background jobs |
| LF-APP-UAT endpoint | `[fill in]` | UAT environment |
| Load balancer DNS name | `[fill in]` | |

## 4. Database

| Item | Placeholder | Notes |
|---|---|---|
| RDS endpoint, production | `[fill in]` | PostgreSQL, Multi-AZ |
| RDS endpoint, UAT | `[fill in]` | PostgreSQL, single-AZ |
| Database name | `eduwand` | Suggested default |
| Database user | `[fill in]` | Application-level user, not the master user |
| Database password | `[stored in secrets manager]` | Never commit to source control |
| Connection pool size | `[fill in]` | Set based on expected concurrent connections |

## 5. AI Provider, Amazon Bedrock

| Item | Placeholder | Notes |
|---|---|---|
| Bedrock region | `ap-south-1`, or nearest supported region | Confirm Bedrock model availability in Mumbai region, use nearest supported region if unavailable |
| Claude Sonnet model ID | `[fill in from Bedrock console]` | Used for lesson and report generation |
| Claude Haiku model ID | `[fill in from Bedrock console]` | Used for grading and personalisation |
| Nova Lite model ID | `[fill in from Bedrock console]` | Used for lightweight tasks |
| IAM policy for Bedrock invoke | `[fill in]` | Scoped to InvokeModel on the three model IDs above |

## 6. Messaging

| Item | Placeholder | Notes |
|---|---|---|
| SMS gateway provider | `[fill in]` | Must support DLT-registered sender IDs |
| SMS gateway API key | `[stored in secrets manager]` | |
| DLT sender ID | `[fill in, pending registration]` | See Section 8 of the Engineering PRD |
| Transactional email provider | `[fill in]` | For example SES or SendGrid |
| Email API key | `[stored in secrets manager]` | |
| From address | `[fill in]` | Domain must be verified with the email provider |

## 7. Authentication

| Item | Placeholder | Notes |
|---|---|---|
| Identity provider | `[fill in]` | For example Firebase Auth or Auth0 |
| OAuth client ID | `[fill in]` | |
| OAuth client secret | `[stored in secrets manager]` | |
| Token expiry | `[fill in]` | Suggested short-lived access token with refresh token |

## 8. Storage

| Item | Placeholder | Notes |
|---|---|---|
| S3 bucket, documents | `[fill in]` | Admissions document uploads |
| S3 bucket, generated content | `[fill in]` | Optional, if storing generated content as files rather than only in the database |
| Bucket region | `ap-south-1` | |

## 9. Monitoring

| Item | Placeholder | Notes |
|---|---|---|
| CloudWatch log group | `[fill in]` | |
| Alert notification target | `[fill in]` | Email or SMS for critical alerts |

## 10. Environment Variable Checklist

Suggested environment variable names for the backend application. Adjust to match your framework's conventions.

```
DATABASE_URL
AWS_REGION
BEDROCK_CLAUDE_SONNET_MODEL_ID
BEDROCK_CLAUDE_HAIKU_MODEL_ID
BEDROCK_NOVA_LITE_MODEL_ID
SMS_GATEWAY_API_KEY
SMS_DLT_SENDER_ID
EMAIL_API_KEY
EMAIL_FROM_ADDRESS
OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET
S3_DOCUMENTS_BUCKET
JWT_SECRET
```

## 11. Before Development Starts

- Confirm AWS account access and Bedrock model access are granted
- Confirm the three Bedrock model IDs are available in the chosen region
- Provision a development database, separate from UAT and production
- Set up a secrets manager or equivalent, and confirm no secrets are committed to source control
- Confirm DLT sender ID registration status, since SMS sending cannot be tested end-to-end until this is approved

---
*End of document. Fovea Infotech. Confidential.*
