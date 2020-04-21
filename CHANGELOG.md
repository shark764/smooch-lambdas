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
