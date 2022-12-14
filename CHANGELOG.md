# 1.49.0
* CXV1-27349 - Use V2 sunshine API to create web integrations to allow multiple web integrations on the same app.

# 1.48.3
* no-jira - Added new triggers to create smooch app, removed EDN to JSON converter, rich text changes for flow

# 1.48.2
* CXV1-27115 - Fixed flow responses sent from rich text and failure cases from smooch webhook to fix collect message banner response

# 1.48.1
* CXV1-27115 - Added banner notification for failed facebook messages and other smooch message failure. Fix collect message and postbacks. Added channel-sub-type and artifact-sub-type.

# 1.48.0
* CXV1-27153 - Added smooch message interrupts 'message-sent', 'message-received', 'message-postback-received', 'message-delivery-error'

# 1.47.4
* CXV1-26997 - Smooch Rich Messaging | Update rich-message lambda to send system-silent message

# 1.47.3
* CXV1-27074 - Fix axios upload artifact file size limit increased to 50MB, reverted channelSubType temporarily

# 1.47.2
* CXV1-27076 - Fix timeout on set-webhook-trigger, removed queue

# 1.47.1
* CXV1-27117 - register send-rich-message action to enable flow messages

# 1.47.0
* CXV1-27076 - Added set-webhook-triggers lambda to migrate smooch apps

# 1.46.3
* CXV1-27005 - Updated rich messaging lambda and changes to smooch webhook for handling rich messsages

# 1.46.2
* CXV1-26993 - Smooch Rich Messaging | Text Message Transcripts with shorthand and/or action buttons

# 1.46.1
* CXV1-27015 - Added channel-sub-type as interaction params to support multiple channels

# 1.46.0
* CXV1-27005 - Added new lambda for rich messaging action

# 1.45.3
* CXV1-26918 - Added firstname and lastname for screen pop contact search

# 1.45.2
* CXV1-24412 - Update Facebook lambdas to use smooch API URL

# 1.45.0
* CXV1-24397 - Added support for multiple messages from smooch

# 1.44.3
* CXV1-24310 - Fixed error msg response for web/facebook for multiple required param in body

# 1.44.2
* CXV1-24310 - removed fbAppId, fbPageId dependency from Update Facebook lambda

# 1.44.1
* CXV1-24310 - Added test parameter to delete-whatsapp-lambda for automated testing. Fixed error code response in update whatsapp lambda

# 1.44.0
* CXV1-24310 - Added new delete whatsapp integration lambda, changed no-integration response code as 404 for web, updated facebook dev-dependency

# 1.43.1
* no-jira - Changed update web intergration response from 201 to 200, added support for messenger with no name from smooch

# 1.43.0
* CXV1-24143 - Adding update-facebook-integration lambda

# 1.42.0
* CXV1-24143 - Adding get-facebook-integration lambda

# 1.41.0
* CXV1-24143 - Added delete-facebook-lambda + added long lived user access token in create facebook integration

# 1.40.2
* no-jira - update alonzo to fix the install script, changed permission error code from 400 to 403 for smooch apps

# 1.40.1
* no-jira - Fix build process to update alonzo in dependency and include aws-sdk in dev-dependency

# 1.40.0
* CXV1-24143 - Added create-facebook-integration lambda

# 1.39.1
* CXV1-24144 - reverted the givenName removal from smooch-webhook

# 1.39.0
* CXV1-24143 - Updated get-facebook-integrations, logging changes to API lambdas

# 1.38.0
* CXV1-24143 - Adding terraform permissions for facebook lambdas

# 1.37.1
* CXV1-24217 - updated dependecies for all lambdas (aws-sdk - v2.877.0, smooch-core - 8.11.4, axios - v0.21.1, libphonenumber-js - 1.9.15, serenova-js-utils - 4.7.0, uuid - 8.3.2)

# 1.37.0
* CXV1-24144 - smooch-webhook changes for Facebook migration

# 1.36.2
* no-jira - Bump alonzo version for all lambdas.

# 1.36.1
* CXV1-24143 - Bump alonzo version in new lambdas (smooch facebook integration).

# 1.36.0
* CXV1-24143 - CX CRUD API for Smooch Facebook apps (code base without any logic).

# 1.35.0
* CXV1-24092 - Updates for REGION_PREFIX (needed for APAC AWS resources) and general environment variables cleanup.
* Fixed bug with disconnect messages ("agent disconnected") on customer disconnect.

# 1.34.6
* CXV1-23386 - Clean up old API Gateway code paths after deploy.

# 1.34.5
* CXV1-23838 - Label from collect messages are sent to Agent at the same time they are sent to Customer. | Whatsapp messaging.

# 1.34.4
* CXV1-23540 - Whatsapp Notification issue as auth params wasn't passed correctly

# 1.34.3
* CXV1-23540 - Fix send-message failure due to returns in inactivity timeout

# 1.34.2
* CXV1-23540 - Code refactoring for client/whatsapp disconnect checkers. Added test cases for whatsapp disconnect checker.

# 1.34.1
* CXV1-23542 - Changes for collect message for web to include collect actions from dynamodb

# 1.34.0
* CXV1-23359 - Send a notification for Skylight to display when automatically ending the interaction after 24 hours.

# 1.33.3
* CXV1-23408 - Fix validation to render quoted files/images | WhatsApp lambdas.

# 1.33.2
* CXV1-23408 - Render quoted reply in history messages in Skylight | WhatsApp lambdas.

# 1.33.1
* CXV1-23663 - Response from collect messages are no longer showing empty text and bad timestamp | Web messaging.
* CXV1-23564 - Form responses are no longer throwing Nan timestamp errors. |Web messaging.

# 1.33.0
* CXV1-23408 - Render quoted reply from message in Skylight | WhatsApp lambdas.

# 1.32.1
* <no-jira> - Fixing permission PLATFORM_VIEW_ALL missing for GET request | Whatsapp lambdas.

# 1.32.0
* CXV1-23698 - Allow interaction properties to be set on create interaction from web client.

# 1.31.2
* <no-jira> - Showing hidden messages for whatsapp interactions on conversation, transcript and messages sent from flow.

# 1.31.1
* <no-jira> - Filtering out hidden messages while agent is on interaction. | Web Messaging.

# 1.31.0
* CXV1-23699 - Sending a message to customer when the interaction is created. Filtering out that message from conversation and transcription. | Web Messaging.

# 1.30.5
* CXV1-21854 - Name attribute for create/update whatsapp integration lambdas doesn't allow blanck space as value.

# 1.30.4
* CXV1-21854 - Fixing create/update lambda shouldn't allow other than true|false as valid value. ClientDisconnectMinutes now allows null as value.

# 1.30.3
* CXV1-21854 - Fixing parameter and body validation for whatsappId value. Adding back unit tests for send-message / send-attachment / smooch-webhook.

# 1.30.2
* CXV1-21854 - Applying correct permissions to whatsapp configuration lambdas.

# 1.30.1
* CXV1-21854 - Adding checker for activated whatsapp integration to apply customer disconnect after minutes.

# 1.30.0
* CXV1-21863 - Adding collect-message-response flow for whatsapp, message collected via text

# 1.29.9
* CXV1-23358 - Created whatsapp customer message timestamp attribute for disconnect checker

# 1.29.8
* <no-jira> - Updated smooch webhook logging

# 1.29.7
* CXV1-23358 - Added edge case scenario for whatsapp disconnect checker, timeout not multiple of delay time

# 1.29.6
* CXV1-23541 - Make collect message interaction metadata update async and in correct order

# 1.29.5
* CXV1-23440 - Customer phoneNumber used for whatsapp interactions when messages are sent after interaction is created.

# 1.29.4
* CXV1-21854 - Adding "active" property to dynamo table record creation for whatsapp integrations.

# 1.29.3
* CXV1-23360 -  Fixing use customer phone number as display name on reporting transcript for whatsapp interactions.

# 1.29.2
* CXV1-23358 - Adding changes to "smooch-webhook" to trigger "smooch-whatsapp-disconnect-checker" in case of whatsapp

# 1.29.1
* CXV1-21854 - Adding unit tests for "create-whatsapp-integration" and "update-whatsapp-integration". Updating unit tests for the rest of whatsapp lambdas.

# 1.29.0
* CXV1-23358 -  Added whatsapp disconnect lambda to disconnect whatsapp client after 24 hours of inactivity, by queue delay.

# 1.28.0
* CXV1-21854 - Updating handlers for "create-whatsapp-integration" and "update-whatsapp-integration".
* <no-jira> - Removing unneeded in iam-policies for whatsapp lambdas.

# 1.27.0
* CXV1-21854 - Updating handlers for "get-whatsapp-integrations" and "get-whatsapp-integration".
* <no-jira> - Updating iam-policies for new whatsapp lambdas to handle function invoke.

# 1.26.0
* CXV1-23357 - Updating smooch-webhook to handle whatsapp messages.
* CXV1-23380 - Fixing check for inactivity timeout to avoid breaking interactions when user has not configured it yet.

# 1.25.3
* <no-jira> - Updating get-whatsapp-apps lambda to return an array of integrations.

# 1.25.2
* <no-jira> - Fixing permission for dynamoDb table access on get-whatsapp-apps lambda.

# 1.25.1
* <no-jira> - Updating new lambdas iam-policy for whatsapp integration.

# 1.25.0
* CXV1-21854 - Adding lambdas for Smooch Whatsapp integration handlers.

# 1.24.0
* CXV1-23118 - handle no customer name on first web chat message

# 1.23.0
* CXV1-23108 - API prechat 'none'

# 1.22.4
* CXV1-23023 - Allow empty strings in chat branding field (buttonIconUrl) in the update api

# 1.22.3
* Removing install dependencies on lambdas from build script
* Upgrading alonzo version to 8.0.2.

# 1.22.2
* CXV1-23023 - Allow empty strings in chat branding fields in the update api
* Automatically deploy lambdas to dev after building in Jenkins. Will also deploy to qe if version is not a snapshot

# 1.22.1
* Updating alonzo version. Fixed error on utils imports.

# 1.22.0
* CXV1-20128 - Changing jest and eslint configuration to use alonzo's instead.

# 1.21.0
* CXV1-20128 - Removing install and zip scripts to use alonzo instead for same purpose.

# 1.20.0
* CXV1-20128 - Replacing js-utils with alonzo as logging tool for lambdas.

# 1.19.4
* Get smooch apps from DynamoDB table.

# 1.19.3
* Add error info in log.error in set-conversation-retention-seconds.

# 1.19.2
* CXV1-21652 - Setting CX credentials for Register Gateway Lambda.

# 1.19.1
* Removed unused rotate keys lambda

# 1.19.0
* CXV1-21652 - Creating new lambda to make gateway registration API request.

# 1.18.13
* CXV1-21634 - Fixing reset disconnect timer only after customer stops typing if agent sent last message.

# 1.8.12
* CXV1-21938 Agent can send message to dead interaction and customer will receive it after starting a new one

# 1.18.11
* CXV1-21634 - Disconnect timer is reset after customer stops typing.

# 1.18.10
* CXV1-22020: Add first attachment message in the transcript file after client disconnect.

# 1.18.9
* CXV1-22077: Add validation to avoid multiple artifact file creations per interaction.

# 1.18.8
* CXV1-21876 - Change default conversation retention seconds to 48 hrs.

# 1.18.7
* CXV1-21876 - Delete recreate-smooch-apps lambda.

## 1.18.6
* CXV1-21938 - Agent can send message to dead interaction and customer will receive it after starting a new one

## 1.18.5
* CXV1-21876 - Remove scheduleSmoochAttachmentDeletion in upload-artifact-file lambda.

# 1.18.4
* CXV1-21876 - Fix issues and add tests to recreate-smooch-apps lambda.

## 1.18.3
* INVALID S3 IAM POLICY on send-attachment lambda. DO NOT RELEASE PRIOR TO THIS VERSION

## 1.18.2
* CXV1-21722 - Smooch collect message response breaks if you pass in a message >128 characters

## 1.18.1
* CXV1-21876 - Add getSecrets and putSecrets permissions to recreate-smooch-apps lambda.

## 1.18.0
* CXV1-21876 - Add recreate-smooch-apps lambda.

## 1.17.2
* CXV1-21876 - Fix set-conversation-retention-seconds.

## 1.17.1
* CXV1-21974 - Fix creating interactions after client disconnect.

## 1.17.0
* CXV1-21876 - Add set-conversation-retention-seconds lambda.

## 1.16.7
* CXV1-21876 - Fix conversationRetentionSeconds param to create-smooch-app lambda.

## 1.16.6
* CXV1-21876 - Add conversationRetentionSeconds param to create-smooch-app lambda.

## 1.16.5
* CXV1-21639 - Reset client disconnect timer after transfer.

## 1.16.4
* CXV1-21740 - Fix FormData issue in upload-artifact-file.

## 1.16.3
* CXV1-21818 - Adding timestamp for interactions to filter messages in transcripts.
* CXV1-21864 - Filtering out previous interaction messages from transcript.

## 1.16.2
* CXV1-21459 - Handle a second incoming message after interaction has died.

## 1.16.1
* CXV1-21459 - Create a new interaction if the previous one has died.

## 1.16.0
* CXV1-21740 - Move uploadArtifactFile into a separate lambda.

## 1.15.9
* Use latest sprockets to hopefully fix deploys

## 1.15.8
* CXV1-21818 - Adding interactionId to messages send to smooch.

## 1.15.7
* Remove artifact file url from transcript file url

## 1.15.6
* CXV1-21723 - Increase max file size to 25MB for send-attachment.

## 1.15.5
* CXV1-21723 - Decrease max file size for send-attachment.

## 1.15.4
* CXV1-21723 - Add file size restriction and increase memory for send-attachment.

## 1.15.3
* CXV1-21800 - Fix errors trying to upload artifact file for non-attachment messages

## 1.15.2
* CXV1-21778 - Check disconnect event against current interaction before disconnecting client.

## 1.15.1
* CXV1-21720 - Adding value to response to handle pending message state for sending attachments.

## 1.15.0
* CXV1-21428 - Remove Smooch Attachment after 12 hours.

## 1.14.4
* CXV1-15797 - Return Smooch file status text to send-attachment error response.

## 1.14.3
* Update delete-smooch-attachments queue permissions.

## 1.14.2
* Update queue policy file formatting.

## 1.14.1
* Add queue policy file to delete-smooch-attachments lambda's queue.

## 1.14.0
* Add delete-smooch-attachments lambda.

## 1.13.7
* CXV1-21427 - Save transcript validator on transcript file metadata.

## 1.13.6
* CXV1-21426 - Fixing message response to skylight when the attachment was successfully sent.

## 1.13.5
* CXV1-21674 - Send artifactId to transcript creation on disconnect checker

## 1.13.4
* CXV1-21427 - Save message id on artifact metadata for mapping to transcript message.

## 1.13.3
* CXV1-15797 - Use artifact url instead of smooch mediaUrl in transcript.
  
## 1.13.2
* CXV1-21426 - Add attachments from Skylight to artifact.
  
## 1.13.1
* CXV1-15797 - Add message id to the message body saved in the transcript.

## 1.13.0
* CXV1-15797 - Save attachments to the transcript.

## 1.12.1
* CXV1-21674 - Create interaction transcript when ending the interaction.

## 1.12.0
* CXV1-21427 - Save customer attachments to the artifact.

## 1.11.0
* CXV1-21427 - Move artifact creation to right before the interaction is created.

## 1.10.0
* CXV1-21426 - New lambda to send attachments from Skylight to Smooch.
  
## 1.9.2
* CXV1-21338 - Delete customer interaction when they don't have messages and are inactive.

## 1.9.1
* CXV1-21338 - Don't retry customer-interrupt on response status 404.

## 1.9.0
* CXV1-21425 - Add images and files support on get conversation history.

## 1.8.7
* CXV1-21338 - Customer read indicator doesn't count as client activity.

## 1.8.6
* CXV1-21338 - Put disconnect check back on queue if timeout hasn't ended
* CXV1-21338 - Fix conversation events timestamp on client activity.

## 1.8.5
* CXV1-21499 - Put back agent disconnect message in customer disconnect.

## 1.8.4
* CXV1-21338 - Actually fix setting clientDisconnectMinutes to null on web integration update

## 1.8.3
* CXV1-21338 - Fix setting clientDisconnectMinutes to null on web integration update and create

## 1.8.2
* CXV1-21338 - Fix clientDisconnectMinutes on web integration update

## 1.8.1
* CXV1-21338 - Fix clientDisconnectMinutes on web integration create

## 1.8.0
* CXV1-21338 - Add clientDisconnectMinutes to web integration create and update

## 1.7.1
* CXV1-21338 - Check for configurable disconnect timeout.

## 1.7.0 
* CXV1-21425 - Add images and files support

## 1.6.7
* CXV1-21338 - Delete interaction for inactive customer.

## 1.6.6
* CXV1-21460 - Fix smooch interactions TTL to not be 50,000 years in the future.

## 1.6.5
* CXV1-21487 - Make application log levels indexable.

## 1.6.4
* CXV1-21460 - Actually fix smooch interactions TTL getting overwritten.

## 1.6.3
* CXV1-21460 - Fix smooch interactions TTL getting overwritten.

## 1.6.2
* CXV1-21338 - Update latest customer activity on read/typing event.

## 1.6.1
* CXV1-21338 - Fix queue_delay_seconds var.

## 1.6.0
* CXV1-21338 - Perform Customer Disconnect when the customer hasn't been active for more than 5 minutes.
  
## 1.5.4
* CXV1-21460 - Add TTL to smooch interactions.

## 1.5.3
* CXV1-21451 - Remove disconnect message from customer disconnect.

## 1.5.2
* CXV1-21451 - Only process the first customer disconnect received. Prevents double agent disconnect messages and double transcript creation.

## 1.5.1
* CXV1-21401 - Fix styling of collect message messages to be system.

## 1.5.0
* CXV1-21148 - Create new interaction on customer message when no interaction exists.

## 1.4.2
* CXV1-21147 - Move action response to customer disconnect.

## 1.4.1
* CXV1-21147 - Send "Agent Connected" message to agents.
* CXV1-21147 - Send flow response on customer disconnect.

## 1.4.0
* CXV1-21399 - Remove "smooch" integration creation from digital channels app create

## 1.3.3
* Fix create-messaging-transcript iam policy file

## 1.3.2
* Add a return statement when customer disconnect finishes (smooch-action-disconnect)
  
## 1.3.1
* CXV1-21385 - User with proper platform permission are able to invoke GET digital-channels-app.

## 1.3.0
* CXV1-21381 - Move transcript creation into its own lambda function.
* CXV1-21147 - Add capitalization to form field for System messages.

## 1.2.0
* CXV1-21381 - Move transcript creation to customer disconnect (smooch-action-disconnect)

## 1.1.0
* CXV1-21147 - Send message when an agent connect or disconnects

## 1.0.19
* <no-jira> - Adding pre-commit and pre-push script.

## 1.0.18
* CXV1-21335 - Transcript now includes all messages.

## 1.0.17
* CXV1-21147 - Update add-participant iam policy

## 1.0.16
* CXV1-21402 - Fix send message actions sent to agents

## 1.0.15
* Add flow response update on smooch-webhook for collect-message-response

## 1.0.14
* Add region to CX URLs

## 1.0.13
* CXV1-21294 - Add agentMessageId to send-message lambda

## 1.0.12
* CXV1-21149 - Remove agent(s) from participants list on customer disconnect action so agents don't continue to get messages after the interaction has ended

## 1.0.11
* CXV1-21146 - Add firstName to message metadata

## 1.0.10
* Fix customer events erroring before interaction has been created
* Fix end interaction events being called from old messaging (without smooch app ids)
* Fix empty array being set on origin whitelist (acually set it to null)

## 1.0.9
* increase memory

## 1.0.8
* Fix reporting events on messages

## 1.0.7
* Fix auth for the flow response

## 1.0.6
* Fix empty array being set on origin whitelist disabling all pages from being able to load the chat widget.

## 1.0.5
* Fix iam policy not allowing apps to be created.
