/* eslint-disable max-len */
const axios = require('axios');
const uuidv4 = require('uuid/v4');
const uuidv1 = require('uuid/v1');

jest.mock('axios');
jest.mock('smooch-core');
jest.mock('uuid/v4');
jest.mock('uuid/v1');

uuidv4.mockImplementation(() => 'new-interaction-id');
uuidv1.mockImplementation(() => 'mock-uuid-v1');
global.Date.now = jest.fn(() => 1588787136364);
global.Date.prototype.getTime = jest.fn(() => '00:00:00');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: {
        InteractionId: '1',
        'contact-point': 'contactPoint',
      },
    }),
  }));

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        id: 'mock-secret-id',
        secret: 'mock-secret',
      }),
    }),
  }));

const mockSmoochUpdate = jest.fn();

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockPut = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockUpdate = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    update: mockSmoochUpdate,
  },
}));

const mockGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'url://testurl',
    }),
  }));

jest.mock('smooch-core', () => mockSmoochCore);

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetQueueUrl,
    sendMessage: mockSendMessage, // mockSendMessage,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      put: mockPut, // mockPut,
      update: mockUpdate, // mockUpdate,
    })),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

axios.mockImplementation(() => ({
  data: {
    collectActions: [{
      actionId: 'actionId',
    }],
    participants: [{
      sessionId: 'mock-session-id',
      resourceId: 'mock-resource-id',
    }],
    artifactId: 'mock-artifact-id',
    latestMessageSentBy: 'customer',
  },
}));

const index = require('../index');

const { handler, handleFormResponse } = index;

const body = {
  app: {
    _id: 'mock-smooch-app-id',
  },
  appUser: {
    _id: 'mock-app-user-id',
    properties: {
      tenantId: 'mock-tenant-id',
      customer: 'mock-customer',
    },
  },
  client: {
    integrationId: 'mock-integration-id',
    platform: 'web',
  },
  timestamp: 'mock-timestamp',
};

const event = (bodyParam = body) => ({
  Records: [{
    body: JSON.stringify(bodyParam),
  }],
});

describe('smooch-webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('handler', () => {
    it('continues when there are more than one record', async () => {
      const eventWithMultipleRecords = event();
      eventWithMultipleRecords.Records.push('mock multiple record');
      await handler(eventWithMultipleRecords);
    });
    it('returns when there is no client', async () => {
      const bodyWithoutClient = { ...body };
      delete bodyWithoutClient.client;
      const result = await handler(event(bodyWithoutClient));
      expect(result).toEqual('no client');
    });
    it('throws an error when there is a problem retrieving cx credentials', async () => {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      try {
        await handler(event());
      } catch (error) {
        expect(Promise.reject(new Error('An Error has occurred trying to retrieve cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
    it('throws an error when there is a problem getting smooch interaction records', async () => {
      mockGet.mockRejectedValueOnce(new Error());
      try {
        await handler(event());
      } catch (error) {
        expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
    describe('walkthrough', () => {
      beforeEach(async () => {
        await handler(event());
      });
      it('calls getSecretValue correctly', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });
      it('calls docClient.get correctly', async () => {
        expect(mockGet.mock.calls).toMatchSnapshot();
      });
    });
    describe('message:appUser', () => {
      it('handles the first message received from smooch', async () => {
        const result = await handler(event({
          ...body,
          trigger: 'message:appUser',
          messages: [
            { type: 'file' },
            { },
          ],
        }));
        expect(result).toEqual('success');
      });

      describe('web', () => {
        describe('formResponse', () => {
          // it('calls handleFormResponse correctly', async () => {
          //   const spyOnHandleFormResponse = jest.spyOn(index, 'handleFormResponse')
          //     .mockImplementationOnce(() => { });
          //   await handler(event({
          //     ...body,
          //     trigger: 'message:appUser',
          //     messages: [{
          //       type: 'formResponse',
          //       name: 'mock-name',
          //       fields: [{}],
          //     }],
          //   }));
          //   expect(spyOnHandleFormResponse.mock.calls).toMatchSnapshot();
          // });
        });

        describe('text', () => {
          // it('calls handleCustomerMessage correctly', async () => {
          //   const handleCustomerMessage = jest.spyOn(index, 'handleCustomerMessage')
          //     .mockImplementationOnce(() => {});
          //   await handler(event({
          //     ...body,
          //     trigger: 'message:appUser',
          //     messages: [{
          //       type: 'text',
          //       fields: [{}],
          //     }],
          //   }));
          //   expect(handleCustomerMessage.mock.calls).toMatchSnapshot();
          // });
        });

        describe('image', () => {
          // it('calls handleCustomerMessage correctly', async () => {
          //   const handleCustomerMessage = jest.spyOn(index, 'handleCustomerMessage')
          //     .mockImplementationOnce(() => {});
          //   await handler(event({
          //     ...body,
          //     trigger: 'message:appUser',
          //     messages: [{
          //       type: 'image',
          //       fields: [{}],
          //     }],
          //   }));
          //   expect(handleCustomerMessage.mock.calls).toMatchSnapshot();
          // });
        });

        describe('file', () => {
        //   it('calls handleCustomerMessage correctly', async () => {
        //     const handleCustomerMessage = jest.spyOn(index, 'handleCustomerMessage')
        //       .mockImplementationOnce(() => {});
        //     await handler(event({
        //       ...body,
        //       trigger: 'message:appUser',
        //       messages: [{
        //         type: 'file',
        //         fields: [{}],
        //       }],
        //     }));
        //     expect(handleCustomerMessage.mock.calls).toMatchSnapshot();
        //   });
        });

        describe('when unsupported type is received', () => {
          it('does nothing when unsupported type is received', async () => {
            const result = await handler(event({
              ...body,
              trigger: 'message:appUser',
              messages: [{ type: 'mock-type', mediaUrl: 'url://mock-mediaUrl' }],
            }));
            expect(result).toEqual('Unsupported web type');
          });
        });
      });

      describe('when Unsupported platform is received', () => {
        it('does nothing when Unsupported platform is received', async () => {
          const result = await handler(event({
            ...body,
            trigger: 'message:appUser',
            client: {
              integrationId: 'mock-integration-id',
              platform: 'mock-platform',
            },
            messages: [
              { type: 'type' },
              { },
            ],
          }));
          expect(result).toEqual('Unsupported platform');
        });
      });
    });
    describe('conversation:read', () => {
      it('returns when no interaction', async () => {
        mockGet.mockImplementationOnce(() => ({
          promise: () => ({
            Item: {
              InteractionId: 'interaction-404',
            },
          }),
        }));
        const result = await handler(event({
          ...body,
          trigger: 'conversation:read',
        }));
        expect(result).toEqual('conversation:read no interaction');
      });
      it('calls sendConversationEvent correctly', async () => {
        const sendConversationEvent = jest.spyOn(index, 'sendConversationEvent')
          .mockImplementationOnce(() => { });
        await handler(event({
          ...body,
          trigger: 'conversation:read',
        }));
        expect(sendConversationEvent.mock.calls).toMatchSnapshot();
      });
    });
    describe('typing:appUser', () => {
      it('returns when no interaction', async () => {
        mockGet.mockImplementationOnce(() => ({
          promise: () => ({
            Item: {
              InteractionId: 'interaction-404',
            },
          }),
        }));
        const result = await handler(event({
          ...body,
          trigger: 'typing:appUser',
        }));
        expect(result).toEqual('typing:appUser no interaction');
      });
      it('calls sendConversationEvent correctly', async () => {
        const sendConversationEvent = jest.spyOn(index, 'sendConversationEvent')
          .mockImplementationOnce(() => { });
        await handler(event({
          ...body,
          trigger: 'typing:appUser',
          activity: {
            type: 'typing:start',
          },
        }));
        expect(sendConversationEvent.mock.calls).toMatchSnapshot();
      });
      it('uses typing-stop', async () => {
        const sendConversationEvent = jest.spyOn(index, 'sendConversationEvent')
          .mockImplementationOnce(() => { });
        await handler(event({
          ...body,
          trigger: 'typing:appUser',
          activity: {
            type: 'typing:stop',
          },
        }));
        expect(sendConversationEvent.mock.calls[0][0].conversationEvent).toEqual('typing-stop');
      });
    });
    it('returns for unsupported triggers', async () => {
      const result = await handler(event({
        ...body,
        trigger: 'bogus trigger',
      }));
      expect(result).toEqual('unsupported trigger');
    });
  });

  describe('handleFormResponse', () => {
    const spyOnCreateInteraction = jest.spyOn(index, 'createInteraction');
    const spyOnHandleCollectMessageResponse = jest.spyOn(index, 'handleCollectMessageResponse');

    const input = {
      appId: 'mock-app-id',
      userId: 'mock-user-id',
      integrationId: 'mock-integration-id',
      tenantId: 'mock-tenant-id',
      interactionId: 'mock-interaction-id',
      form: {
        name: 'Web User ',
        type: 'formResponse',
        fields: [{
          text: 'example',
        }],
        _id: '_id',
        received: '10',
      },
      auth: 'auth',
      logContext: '',
    };

    describe('prechat capture', () => {
      it('returs when handleFormResponse is successful', async () => {
        const result = await handleFormResponse(input);
        expect(result).toEqual('handleFormResponse Successful');
      });

      // it('passes in the correct arguments to createInteraction()', async () => {
      //   await handleFormResponse({
      //     ...input,
      //     form: {
      //       name: 'Web User ',
      //       type: 'formResponse',
      //       fields: [{
      //         email: 'mock-email',
      //       }],
      //       _id: '_id',
      //       received: '10',
      //     },
      //   });
      //   expect(spyOnCreateInteraction.mock.calls).toMatchSnapshot();
      // });

      it('when prechat form is submitted with no customer indentifier', async () => {
        const mockInput = {
          ...input,
          form: {
            name: 'Web User ',
            fields: [],
          },
        };
        await handleFormResponse(mockInput);
      });

      it('throws an error when there problem retrieving digital channels credentials', async () => {
        mockGetSecretValue.mockRejectedValueOnce(new Error());
        try {
          await handleFormResponse(input);
        } catch (error) {
          expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials (form getSecretValue())'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there problem retrieving digital channels credentials (form SmoochCore) 1', async () => {
        mockSmoochCore.mockImplementationOnce(() => {
          throw new Error();
        });
        try {
          await handleFormResponse(input);
        } catch (error) {
          expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there problem updating Smooch appUser 1', async () => {
        mockSmoochUpdate.mockRejectedValueOnce(new Error());
        try {
          await handleFormResponse(input);
        } catch (error) {
          expect(Promise.reject(new Error('Error updating Smooch appUser'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there is a problem creating interaction', async () => {
        spyOnCreateInteraction.mockImplementationOnce(() => { throw new Error(); });
        try {
          await handleFormResponse(input);
        } catch (error) {
          expect(Promise.reject(new Error('Failed to create an interaction'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });
    });

    describe('collect message response', () => {
      it('passes in the correct arguments to handleCollectMessageResponse()', async () => {
        const mockInput = {
          ...input,
          form: {
            name: 'Web',
            type: 'formResponse',
            fields: [{
              text: 'example',
              name: 'collect-message',
            }],
            _id: '_id',
            received: '10',
            quotedMessage: {
              content: {
                metadata: {
                  actionId: 'actionId',
                  subId: 'subId',
                },
              },
            },
          },
        };
        await handleFormResponse(mockInput);
        expect(spyOnHandleCollectMessageResponse.mock.calls).toMatchSnapshot();
      });

      it('breaks when receives an unsupported formResponse', async () => {
        const mockInput = {
          ...input,
          form: {
            name: 'mock-form-name',
            fields: [{
              name: 'mock-name',
            }],
          },
        };
        const result = await handleFormResponse(mockInput);
        expect(result).toEqual('unsupported formresponse');
      });
    });
  });

  describe('handleCollectMessageResponse', () => {
    const input = {
      tenantId: 'mock-tenant-id',
      interactionId: 'mock-interaction-id',
      form: {
        quotedMessage: {
          content: {
            metadata: {
              actionId: 'actionId',
              subId: 'subId',
            },
          },
        },
        fields: [{ text: 'response' }],
      },
      auth: 'auth',
      logContext: 'logContext',
    };

    const { handleCollectMessageResponse } = index;
    const sendCustomerMessageToParticipants = jest.spyOn(index, 'sendCustomerMessageToParticipants');
    const updateInteractionMetadataAsync = jest.spyOn(index, 'updateInteractionMetadataAsync');

    it('calls sendFlowActionResponse correctly', async () => {
      const sendFlowActionResponse = jest.spyOn(index, 'sendFlowActionResponse')
        .mockImplementationOnce(() => {});
      await handleCollectMessageResponse(input);
      expect(sendFlowActionResponse.mock.calls).toMatchSnapshot();
    });

    it('calls sendCustomerMessageToParticipants correctly', async () => {
      sendCustomerMessageToParticipants.mockImplementationOnce(() => {});
      await handleCollectMessageResponse(input);
      expect(sendCustomerMessageToParticipants.mock.calls).toMatchSnapshot();
    });

    it('calls updateInteractionMetadataAsync correctly', async () => {
      updateInteractionMetadataAsync.mockImplementationOnce(() => {});
      await handleCollectMessageResponse(input);
      expect(updateInteractionMetadataAsync.mock.calls).toMatchSnapshot();
    });

    it('returns when no interactionID is provided', async () => {
      const result = await handleCollectMessageResponse({
        ...input,
        interactionId: undefined,
      });
      expect(result).toEqual('No Interaction ID');
    });

    it('throws an error when there are no pending actions', async () => {
      axios.mockImplementationOnce(() => ({
        data: {
          participants: [],
        },
      }));
      try {
        await handleCollectMessageResponse(input);
      } catch (error) {
        expect(error.message).toMatchSnapshot();
      }
    });

    it('throws an error when there are no action found in pending-actions', async () => {
      axios.mockImplementationOnce(() => ({
        data: {
          collectActions: [{
          }],
          participants: [],
        },
      }));
      try {
        await handleCollectMessageResponse(input);
      } catch (error) {
        expect(error.message).toMatchSnapshot();
      }
    });

    it('throws an error when there is a problem sending collect-message response to participants', async () => {
      sendCustomerMessageToParticipants.mockImplementationOnce(() => {
        throw new Error();
      });
      try {
        await handleCollectMessageResponse(input);
      } catch (error) {
        expect(Promise.reject(new Error('Error sending collect-message response to participants'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });

    it('continues when there is a problem removing pending collect-message action from metadata', async () => {
      updateInteractionMetadataAsync.mockImplementationOnce(() => {
        throw new Error();
      });
      const result = await handleCollectMessageResponse(input);
      expect(result).toEqual('handleFormResponse Successful');
    });
  });

  describe('createInteraction', () => {
    const input = {
      appId: 'mock-app-id',
      userId: 'mock-user-id',
      tenantId: 'mock-tenant-id',
      source: '',
      integrationId: 'mock-integration-id',
      customer: 'firstName lastName',
      logContext: 'logContext',
      auth: 'auth',
      smoochMessageId: 'mock-smoochMessage-id',
      isInteractionDead: false,
      timestamp: 10,
    };

    const { createInteraction } = index;

    it('calls docClient.put() correctly', async () => {
      await createInteraction(input);
      expect(mockPut.mock.calls).toMatchSnapshot();
    });

    it('calls docClient.get() correctly', async () => {
      await createInteraction(input);
      expect(mockGet.mock.calls).toMatchSnapshot();
    });

    // it('calls axios correctly', async () => {
    //   await createInteraction(input);
    //   expect(axios.mock.calls).toMatchSnapshot();
    // });

    it('calls docClient.update() correctly', async () => {
      await createInteraction(input);
      expect(mockUpdate.mock.calls).toMatchSnapshot();
    });

    it('returns when there is a problem creating inetraction', async () => {
      mockPut.mockRejectedValueOnce(new Error());
      const result = await createInteraction(input);
      expect(result).toBeFalsy();
    });

    it('returns when the interaction is dead', async () => {
      const result = await createInteraction({
        ...input,
        isInteractionDead: true,
      });
      expect(mockPut.mock.calls).toMatchSnapshot();
      expect(result).toEqual('new-interaction-id');
    });

    it('throws an error when there is a problem retrieving smooch integration from DynamoDB', async () => {
      mockGet.mockRejectedValueOnce(new Error());
      try {
        await createInteraction(input);
      } catch (error) {
        expect(Promise.reject(new Error('Failed to retrieve Smooch integration from DynamoDB'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });

    it('throws an error when there is a problem creating artifact', async () => {
      axios.mockRejectedValueOnce(new Error());
      try {
        await createInteraction(input);
      } catch (error) {
        expect(Promise.reject(new Error('Error creating artifact'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });

    it('throws an error when there is a problem updating the interaction id on the state table', async () => {
      mockUpdate.mockRejectedValueOnce(new Error());
      const result = await createInteraction(input);
      expect(result).toBeFalsy();
    });
  });

  describe('sendCustomerMessageToParticipants', () => {
    const input = {
      tenantId: 'mock-tenant-id',
      interactionId: 'mock-interaction-id',
      contentType: 'contentType',
      message: {
        _id: '_id',
        name: 'mock-name',
        text: 'text',
        received: 10,
        mediaUrl: 'mediaUrl',
        mediaType: 'mediaType',
        mediaSize: 'mediaSize',
        type: 'file',
      },
      auth: 'auth',
      logContext: 'logContext',
    };

    const { sendCustomerMessageToParticipants } = index;
    const uploadArtifactFile = jest.spyOn(index, 'uploadArtifactFile');
    const sendReportingEvent = jest.spyOn(index, 'sendReportingEvent');
    const updateSmoochClientLastActivity = jest.spyOn(index, 'updateSmoochClientLastActivity');

    it('calls getMetadata correctly', async () => {
      await sendCustomerMessageToParticipants(input);
      expect(axios.mock.calls).toMatchSnapshot();
    });

    it('calls sqs.getQueueUrl correctly', async () => {
      await sendCustomerMessageToParticipants(input);
      expect(mockGetQueueUrl.mock.calls).toMatchSnapshot();
    });

    it('calls sqs.sendMessage correctly', async () => {
      await sendCustomerMessageToParticipants(input);
      expect(mockSendMessage.mock.calls).toMatchSnapshot();
    });

    it('calls uploadArtifactFile correctly', async () => {
      uploadArtifactFile.mockImplementationOnce(() => {});
      await sendCustomerMessageToParticipants(input);
      expect(uploadArtifactFile.mock.calls);
    });

    it('calls sendReportingEvent correctly', async () => {
      sendReportingEvent.mockImplementationOnce(() => {});
      await sendCustomerMessageToParticipants(input);
      expect(sendReportingEvent.mock.calls);
    });

    it('calls updateSmoochClientLastActivity correctly', async () => {
      updateSmoochClientLastActivity.mockImplementationOnce(() => {});
      await sendCustomerMessageToParticipants(input);
      expect(updateSmoochClientLastActivity.mock.calls);
    });

    it('when sending message to a dead interaction', async () => {
      const result = await sendCustomerMessageToParticipants({
        ...input,
        message: {
          _id: '_id',
          name: 'mock-name',
          text: 'INTERACTION_NOT_FOUND_ERROR',
          received: 10,
          mediaUrl: 'mediaUrl',
          mediaType: 'mediaType',
          mediaSize: 'mediaSize',
          type: 'file',
        },
      });
      expect(result).toEqual('sendCustomerMessageToParticipants Successful');
    });

    it('returns when there is a problem uploading file to artifact', async () => {
      uploadArtifactFile.mockImplementationOnce(() => {
        throw new Error();
      });
      const result = await sendCustomerMessageToParticipants(input);
      expect(result).toEqual('sendCustomerMessageToParticipants Successful');
    });

    it('returns when there is a problem sending the reporting event', async () => {
      sendReportingEvent.mockImplementationOnce(() => {
        throw new Error();
      });
      const result = await sendCustomerMessageToParticipants(input);
      expect(result).toEqual('sendCustomerMessageToParticipants Successful');
    });

    it('throws an error when there is a problem sending message to participants', async () => {
      axios.mockRejectedValueOnce(new Error());
      try {
        await sendCustomerMessageToParticipants(input);
      } catch (error) {
        expect(Promise.reject(new Error('Error sending message to participants'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });

  describe('shouldCheckIfClientIsDisconnected', () => {
    const input = {
      userId: 'mock-user-id',
      logContext: 'logContext',
    };

    const { shouldCheckIfClientIsDisconnected } = index;

    // it('calls docClient.get() correctly', async () => {
    //   await shouldCheckIfClientIsDisconnected(input);
    //   expect(mockGet.mock.calls).toMatchSnapshot();
    // });

    // it('!hasInteractionItem', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({ Item: {} }),
    //   }));

    //   const result = await shouldCheckIfClientIsDisconnected(input);
    //   expect(result).toEqual(false);
    // });

    // it('LatestCustomerMsgTs > LatestAgentMsgTs', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: {
    //         'client-disconnect-minutes': 50,
    //         LatestCustomerMessageTimestamp: '2020-02-18T20:47:50.670Z',
    //         LatestAgentMessageTimestamp: '2020-02-18T20:47:38.670Z',
    //       },
    //     }),
    //   }));

    //   const result = await shouldCheckIfClientIsDisconnected(input);
    //   expect(result).toEqual(true);
    // });

    // it('InteractionItem exists and LatestCustomerMsgTs <= LatestAgentMsgTs', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: {
    //         'client-disconnect-minutes': 50,
    //         LatestCustomerMessageTimestamp: '2020-02-18T20:47:38.670Z',
    //         LatestAgentMessageTimestamp: '2020-02-18T20:47:50.670Z',
    //       },
    //     }),
    //   }));

    //   const result = await shouldCheckIfClientIsDisconnected(input);
    //   expect(result).toEqual(false);
    // });

    it('throws an error when there is a problem retrieving smooch integration from DynamoDB', async () => {
      mockGet.mockRejectedValueOnce(new Error());
      try {
        await shouldCheckIfClientIsDisconnected(input);
      } catch (error) {
        expect(
          Promise.reject(new Error('Failed to retrieve Smooch integration from DynamoDB')),
        ).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });

  describe('getClientInactivityTimeout', () => {
    const input = {
      logContext: {
        smoochUserId: 'mock-smooch-user-id',
        smoochIntegrationId: 'mock-integration-id',
        tenantId: 'mock-tenant-id',
      },
    };

    const { getClientInactivityTimeout } = index;

    // it('calls docClient.get() correctly', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: {
    //         InteractionId: '1',
    //         'contact-point': 'contactPoint',
    //         'client-disconnect-minutes': 50,
    //       },
    //     }),
    //   }));
    //   await getClientInactivityTimeout(input);
    //   expect(mockGet.mock.calls).toMatchSnapshot();
    // });

    it('throws an error when there is a problem retrieving smooch integration from DynamoDB', async () => {
      mockGet.mockRejectedValueOnce(new Error());
      try {
        await getClientInactivityTimeout(input);
      } catch (error) {
        expect(
          Promise.reject(new Error('Failed to retrieve Smooch integration from DynamoDB')),
        ).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });

  describe('sendConversationEvent', () => {
    const input = {
      tenantId: 'mock-tenant-id',
      interactionId: 'mock-interaction-id',
      conversationEvent: 'typing-stop',
      timestamp: 10,
      auth: 'auth',
      logContext: {
        smoochUserId: 'mock-smooch-user-id',
      },
    };

    const { sendConversationEvent } = index;
    const updateSmoochClientLastActivity = jest.spyOn(index, 'updateSmoochClientLastActivity')
      .mockImplementationOnce(() => {});

    it('calls getMetadata correctly', async () => {
      await sendConversationEvent(input);
      expect(axios.mock.calls).toMatchSnapshot();
    });

    it('calls sqs.getQueueUrl correctly', async () => {
      await sendConversationEvent(input);
      expect(mockGetQueueUrl.mock.calls).toMatchSnapshot();
    });

    it('calls sqs.sendMessage correctly', async () => {
      await sendConversationEvent(input);
      expect(mockSendMessage.mock.calls).toMatchSnapshot();
    });

    it("calls updateSmoochClientLastActivity correctly when conversationEvent is 'typing-stop'", async () => {
      await sendConversationEvent(input);
      expect(updateSmoochClientLastActivity.mock.calls).toMatchSnapshot();
    });

    it("calls updateSmoochClientLastActivity correctly when conversationEvent is not equal to 'conversation-read'", async () => {
      await sendConversationEvent({
        ...input,
        conversationEvent: 'typing-start',
      });
      expect(updateSmoochClientLastActivity.mock.calls).toMatchSnapshot();
    });

    it("returns when conversationEvent === 'conversation-read'", async () => {
      const result = await sendConversationEvent({
        ...input,
        conversationEvent: 'conversation-read',
      });
      expect(result).toEqual('sendConversationEvent Successful');
    });

    it('throws an error when there is problem sending conversation event to participants', async () => {
      axios.mockRejectedValueOnce(new Error());
      try {
        await sendConversationEvent(input);
      } catch (error) {
        expect(Promise.reject(new Error('Error sending conversation event to participants'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });

    describe("latestMessageSentBy !== 'customer'", () => {
      beforeEach(() => {
        axios.mockImplementationOnce(() => ({
          data: {
            participants: [{}],
            latestMessageSentBy: 'agent',
          },
        }));
      });

      // const getClientInactivityTimeout = jest.spyOn(index, 'getClientInactivityTimeout');
      // const shouldCheckIfClientIsDisconnected = jest.spyOn(index, 'shouldCheckIfClientIsDisconnected');
      // const checkIfClientIsDisconnected = jest.spyOn(index, 'checkIfClientIsDisconnected');
      // getClientInactivityTimeout.mockImplementation(() => true);
      // shouldCheckIfClientIsDisconnected.mockImplementation(() => true);

      // it('calls getClientInactivityTimeout correctly', async () => {
      //   await sendConversationEvent(input);
      //   expect(getClientInactivityTimeout.mock.calls).toMatchSnapshot();
      // });

      // it('calls shouldCheckIfClientIsDisconnected correctly', async () => {
      //   await sendConversationEvent(input);
      //   expect(shouldCheckIfClientIsDisconnected.mock.calls).toMatchSnapshot();
      // });

      // it('calls checkIfClientIsDisconnected correctly', async () => {
      //   await sendConversationEvent(input);
      //   expect(checkIfClientIsDisconnected.mock.calls).toMatchSnapshot();
      // });

      // it('returns when no disconnect timer is set', async () => {
      //   getClientInactivityTimeout.mockImplementationOnce(() => false);
      //   const result = await sendConversationEvent(input);
      //   expect(shouldCheckIfClientIsDisconnected).not.toHaveBeenCalled();
      //   expect(result).toEqual('sendConversationEvent Successful');
      // });

      // it('checks for client disconnect when disconnect timer is set', async () => {
      //   getClientInactivityTimeout.mockImplementationOnce(() => true);
      //   const result = await sendConversationEvent(input);
      //   expect(shouldCheckIfClientIsDisconnected).toHaveBeenCalled();
      //   expect(result).toEqual('sendConversationEvent Successful');
      // });

      // it('returns when the client is not disconnected', async () => {
      //   getClientInactivityTimeout.mockImplementationOnce(() => true);
      //   shouldCheckIfClientIsDisconnected.mockImplementationOnce(() => false);
      //   const result = await sendConversationEvent(input);
      //   expect(checkIfClientIsDisconnected).not.toHaveBeenCalled();
      //   expect(result).toEqual('sendConversationEvent Successful');
      // });
    });
  });

  describe('updateSmoochClientLastActivity', () => {
    const input = {
      latestCustomerMessageTimestamp: 10,
      userId: 'mock-user-id',
      logContext: 'logContext',
    };

    const { updateSmoochClientLastActivity } = index;

    it('calls docClient.update correctly', async () => {
      await updateSmoochClientLastActivity(input);
      expect(mockUpdate.mock.calls).toMatchSnapshot();
    });

    it('returns when there is an error updating the latest customer activity', async () => {
      mockUpdate.mockRejectedValueOnce(new Error());
      await updateSmoochClientLastActivity(input);
    });
  });

  describe('handleCustomerMessage', () => {
    const mockEvent = {
      hasInteractionItem: true,
      interactionId: 'mock-interaction-id',
      tenantId: 'mock-tenant-id',
      auth: 'auth',
      logContext: 'logContext',
      appId: 'mock-app-id',
      userId: 'mock-user-id',
      message: {
        received: '10',
        _id: 'mock_id',
        mediaUrl: 'http://mockurl',
      },
      integrationId: 'mock-integrationId-id',
      customer: 'customer',
      type: 'type',
      metadataSource: 'web',
    };

    const inActiveInteractionError = new Error();
    inActiveInteractionError.response = {
      status: 404,
    };
    const { handleCustomerMessage } = index;
    const sendSmoochInteractionHeartbeat = jest.spyOn(index, 'sendSmoochInteractionHeartbeat');
    // const sendCustomerMessageToParticipants = jest.spyOn(index, 'sendCustomerMessageToParticipants');
    const createInteraction = jest.spyOn(index, 'createInteraction');
    const updateInteractionMetadata = jest.spyOn(index, 'updateInteractionMetadata');

    describe('hasInteractionId and interactionID', () => {
      it('calls sendSmoochInteractionHeartbeat correctly', async () => {
        sendSmoochInteractionHeartbeat.mockImplementationOnce(() => { });
        await handleCustomerMessage(mockEvent);
        expect(sendSmoochInteractionHeartbeat.mock.calls).toMatchSnapshot();
      });

      // it('calls sendCustomerMessageToParticipants correctly', async () => {
      //   sendCustomerMessageToParticipants.mockImplementationOnce(() => { });
      //   sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
      //   axios.mockRejectedValueOnce(inActiveInteractionError);
      //   await handleCustomerMessage(mockEvent);
      //   expect(sendCustomerMessageToParticipants.mock.calls).toMatchSnapshot();
      // });

      // it('calls createInteraction correctly', async () => {
      //   sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
      //   createInteraction.mockImplementationOnce(() => { });
      //   await handleCustomerMessage(mockEvent);
      //   expect(createInteraction.mock.calls).toMatchSnapshot();
      // });

      // it('returns when interaction Id is invalid', async () => {
      //   sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
      //   const result = await handleCustomerMessage(mockEvent);
      //   expect(result).toEqual('handleCustomerMessage Successful');
      // });

      it('returns when interaction Id is valid', async () => {
        const error = new Error();
        error.response = {
          status: 500,
        };
        sendSmoochInteractionHeartbeat.mockRejectedValueOnce(error);
        const result = await handleCustomerMessage(mockEvent);
        expect(result).toEqual('handleCustomerMessage Successful');
      });

      // it('returns when the interaction is not dead', async () => {
      //   const error = new Error();
      //   error.response = {
      //     status: 500,
      //   };
      //   sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
      //   axios.mockRejectedValueOnce(error);
      //   const result = await handleCustomerMessage(mockEvent);
      //   expect(result).toEqual('handleCustomerMessage Successful');
      // });

      // it('returns when the interaction is dead', async () => {
      //   sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
      //   axios.mockRejectedValueOnce(inActiveInteractionError);
      //   const result = await handleCustomerMessage(mockEvent);
      //   expect(result).toEqual('handleCustomerMessage Successful');
      // });

      it('returns when latestMessageSentBy is not equal to customer', async () => {
        axios.mockImplementationOnce(() => ({}));
        axios.mockImplementationOnce(() => ({
          data: {
            collectActions: [{
              actionId: 'actionId',
            }],
            participants: [{}],
            artifactId: 'mock-artifact-id',
            latestMessageSentBy: 'customer',
          },
        }));
        axios.mockImplementationOnce(() => ({
          data: { latestMessageSentBy: 'system' },
        }));
        const result = await handleCustomerMessage(mockEvent);
        expect(result).toEqual('handleCustomerMessage Successful');
      });

      it('throws an error when there is a problem creating interaction', async () => {
        sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
        createInteraction.mockImplementationOnce(() => {
          throw new Error();
        });
        try {
          await handleCustomerMessage(mockEvent);
        } catch (error) {
          expect(Promise.reject(new Error('Failed to create an interaction'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there is a problem updating latestMessageSentBy flag from metadata', async () => {
        axios.mockImplementationOnce(() => ({}));
        axios.mockImplementationOnce(() => ({
          data: {
            collectActions: [{
              actionId: 'actionId',
            }],
            participants: [{}],
            artifactId: 'mock-artifact-id',
            latestMessageSentBy: 'customer',
          },
        }));
        axios.mockImplementationOnce(() => ({
          data: { latestMessageSentBy: 'system' },
        }));
        updateInteractionMetadata.mockRejectedValueOnce(new Error());
        try {
          await handleCustomerMessage(mockEvent);
        } catch (error) {
          expect(Promise.reject(new Error('Error updating latestMessageSentBy flag from metadata'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });
    });
    describe('!hasInteractionItem', () => {
      beforeEach(() => {
        mockGet.mockImplementationOnce(() => ({
          promise: () => ({ Item: {} }),
        }));
      });

      const newEvent = {
        ...mockEvent,
        hasInteractionItem: false,
        type: 'file',
      };

      const uploadArtifactFile = jest.spyOn(index, 'uploadArtifactFile');

      // it('calls createInteraction correctly', async () => {
      //   createInteraction.mockImplementationOnce(() => { });
      //   await handleCustomerMessage(newEvent);
      //   expect(createInteraction.mock.calls).toMatchSnapshot();
      // });

      // it('calls uploadArtifactFile correctly', async () => {
      //   uploadArtifactFile.mockImplementationOnce(() => { });
      //   await handleCustomerMessage({
      //     ...mockEvent,
      //     hasInteractionItem: false,
      //     type: 'image',
      //   });
      //   expect(uploadArtifactFile.mock.calls).toMatchSnapshot();
      // });

      // it("returns when type!='file' && type!='image'", async () => {
      //   const result = await handleCustomerMessage({
      //     ...mockEvent,
      //     hasInteractionItem: false,
      //     type: 'text',
      //   });
      //   expect(result).toEqual('handleCustomerMessage Successful');
      // });

      it('throws an error when there is a problem creating interaction', async () => {
        createInteraction.mockImplementationOnce(() => {
          throw new Error();
        });
        try {
          await handleCustomerMessage(newEvent);
        } catch (error) {
          expect(Promise.reject(new Error('Failed to create an interaction'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there is a problem retrieving interaction metadata', async () => {
        axios.mockImplementationOnce(() => ({
          data: {
            artifactId: 'mocked-artifact-id',
          },
        }));
        axios.mockImplementationOnce(() => ({}));
        axios.mockRejectedValueOnce(new Error());
        try {
          await handleCustomerMessage(newEvent);
        } catch (error) {
          expect(Promise.reject(new Error('An Error ocurred retrieving interaction metadata'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when failed to upload artifact file', async () => {
        uploadArtifactFile.mockImplementationOnce(() => {
          throw new Error();
        });
        try {
          await handleCustomerMessage(newEvent);
        } catch (error) {
          expect(Promise.reject(new Error('Failed to upload artifact file'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      const input = {
        appId: 'mock-app-id',
        userId: 'mock-user-id',
        integrationId: 'mock-integration-id',
        tenantId: 'mock-tenant-id',
        interactionId: 'mock-interaction-id',
        form: {
          name: 'Web User ',
          type: 'formResponse',
          fields: [{
            text: 'example',
          }],
          _id: '_id',
          received: '10',
        },
        auth: 'auth',
        logContext: 'logContext',
        customerIdentifier: 'Test',
        cusomter: 'Test',
        message: 'Test',
      };

      it('throws an error when there problem retrieving digital channels credentials', async () => {
        mockGetSecretValue.mockRejectedValueOnce(new Error());
        try {
          await handleCustomerMessage(input);
        } catch (error) {
          expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials (form getSecretValue())'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there problem retrieving digital channels credentials (form SmoochCore) 1', async () => {
        mockSmoochCore.mockImplementationOnce(() => {
          throw new Error();
        });
        try {
          await handleCustomerMessage(input);
        } catch (error) {
          expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there problem updating Smooch appUser 2', async () => {
        mockSmoochUpdate.mockRejectedValueOnce(new Error());
        try {
          await handleCustomerMessage(input);
        } catch (error) {
          expect(Promise.reject(new Error('Error updating Smooch appUser'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      // it('customerIdentifier !== "Customer"', async () => {
      //   const newEvent2 = {
      //     ...mockEvent,
      //     hasInteractionItem: false,
      //     type: 'file',
      //     customerIdentifier: 'Test',
      //   };

      //   mockSmoochUpdate.mockImplementationOnce(() => { });
      //   const result = await handleCustomerMessage(newEvent2);
      //   expect(result).toMatchSnapshot();
      // });

      it('updated smoochUser successfully', async () => {
        const result = await handleCustomerMessage(input);
        expect(result).toMatchSnapshot();
      });
    });

    describe('Interaction Created by something else', () => {
      it('when the interaction is being created by something else', async () => {
        const result = await handleCustomerMessage({
          ...mockEvent,
          interactionId: undefined,
        });
        expect(result).toEqual('handleCustomerMessage Successful');
      });
    });
  });
});
