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
