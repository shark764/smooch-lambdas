const axios = require('axios');
const uuidv4 = require('uuid/v4');

jest.mock('axios');
jest.mock('smooch-core');
jest.mock('uuid/v4');

uuidv4.mockImplementation(() => 'new-interaction-id');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({ Item: { InteractionId: '1' } }),
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

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    update: mockSmoochUpdate,
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: jest.fn().mockImplementation(() => ({ promise: jest.fn().mockImplementation(() => ({ QueueUrl: 'url://testurl' })) })),
    sendMessage: mockSendMessage, // mockSendMessage,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      put: jest.fn().mockImplementation(() => ({ promise: () => ({}) })), // mockPut,
      update: jest.fn().mockImplementation(() => ({ promise: () => ({}) })), // mockUpdate,
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
    participants: [],
    artifactId: 'mock-artifact-id',
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
          it('calls handleFormResponse correctly', async () => {
            const spyOnHandleFormResponse = jest.spyOn(index, 'handleFormResponse')
              .mockImplementationOnce(() => { });
            await handler(event({
              ...body,
              trigger: 'message:appUser',
              messages: [{
                type: 'formResponse',
                name: 'mock-name',
                fields: [{}],
              }],
            }));
            expect(spyOnHandleFormResponse.mock.calls).toMatchSnapshot();
          });
        });

        describe('text', () => {
          it('calls handleCustomerMessage correctly', async () => {
            const handleCustomerMessage = jest.spyOn(index, 'handleCustomerMessage')
              .mockImplementationOnce(() => {});
            await handler(event({
              ...body,
              trigger: 'message:appUser',
              messages: [{
                type: 'text',
                fields: [{}],
              }],
            }));
            expect(handleCustomerMessage.mock.calls).toMatchSnapshot();
          });
        });

        describe('image', () => {
          it('calls handleCustomerMessage correctly', async () => {
            const handleCustomerMessage = jest.spyOn(index, 'handleCustomerMessage')
              .mockImplementationOnce(() => {});
            await handler(event({
              ...body,
              trigger: 'message:appUser',
              messages: [{
                type: 'image',
                fields: [{}],
              }],
            }));
            expect(handleCustomerMessage.mock.calls).toMatchSnapshot();
          });
        });

        describe('file', () => {
          it('calls handleCustomerMessage correctly', async () => {
            const handleCustomerMessage = jest.spyOn(index, 'handleCustomerMessage')
              .mockImplementationOnce(() => {});
            await handler(event({
              ...body,
              trigger: 'message:appUser',
              messages: [{
                type: 'file',
                fields: [{}],
              }],
            }));
            expect(handleCustomerMessage.mock.calls).toMatchSnapshot();
          });
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
          promise: () => undefined,
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
          promise: () => undefined,
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

      it('passes in the correct arguments to createInteraction()', async () => {
        await handleFormResponse(input);
        expect(spyOnCreateInteraction.mock.calls).toMatchSnapshot();
      });

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

      it('throws an error when there problem retrieving digital channels credentials (form SmoochCore)', async () => {
        mockSmoochCore.mockImplementationOnce(() => {
          throw new Error();
        });
        try {
          await handleFormResponse(input);
        } catch (error) {
          expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
        }
      });

      it('throws an error when there problem updating Smooch appUser', async () => {
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
    };

    const inActiveInteractionError = new Error();
    inActiveInteractionError.response = {
      status: 404,
    };
    const { handleCustomerMessage } = index;
    const sendSmoochInteractionHeartbeat = jest.spyOn(index, 'sendSmoochInteractionHeartbeat');
    const sendCustomerMessageToParticipants = jest.spyOn(index, 'sendCustomerMessageToParticipants');
    const createInteraction = jest.spyOn(index, 'createInteraction');
    const updateInteractionMetadata = jest.spyOn(index, 'updateInteractionMetadata');

    describe('hasInteractionId and interactionID', () => {
      it('calls sendSmoochInteractionHeartbeat correctly', async () => {
        sendSmoochInteractionHeartbeat.mockImplementationOnce(() => { });
        await handleCustomerMessage(mockEvent);
        expect(sendSmoochInteractionHeartbeat.mock.calls).toMatchSnapshot();
      });

      it('calls sendCustomerMessageToParticipants correctly', async () => {
        sendCustomerMessageToParticipants.mockImplementationOnce(() => { });
        sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
        axios.mockRejectedValueOnce(inActiveInteractionError);
        await handleCustomerMessage(mockEvent);
        expect(sendCustomerMessageToParticipants.mock.calls).toMatchSnapshot();
      });

      it('calls createInteraction correctly', async () => {
        sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
        createInteraction.mockImplementationOnce(() => { });
        await handleCustomerMessage(mockEvent);
        expect(createInteraction.mock.calls).toMatchSnapshot();
      });

      it('returns when interaction Id is invalid', async () => {
        sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
        const result = await handleCustomerMessage(mockEvent);
        expect(result).toEqual('handleCustomerMessage Successful');
      });

      it('returns when the interaction is dead', async () => {
        sendSmoochInteractionHeartbeat.mockRejectedValueOnce(inActiveInteractionError);
        axios.mockRejectedValueOnce(inActiveInteractionError);
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
        axios.mockImplementationOnce(() => ({
          data: { latestMessageSentBy: 'system' },
        }));
        updateInteractionMetadata.mockImplementationOnce(() => {
          throw new Error();
        });
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

      it('calls createInteraction correctly', async () => {
        createInteraction.mockImplementationOnce(() => { });
        await handleCustomerMessage(newEvent);
        expect(createInteraction.mock.calls).toMatchSnapshot();
      });

      it('calls uploadArtifactFile correctly', async () => {
        uploadArtifactFile.mockImplementationOnce(() => { });
        await handleCustomerMessage(newEvent);
        expect(uploadArtifactFile.mock.calls).toMatchSnapshot();
      });

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
