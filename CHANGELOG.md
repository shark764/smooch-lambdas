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
