const axios = require('axios');
const uuidv1 = require('uuid/v1');

jest.mock('axios');
jest.mock('uuid/v1');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-smooch-api-url',
};
uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e46');
global.Math.abs = jest.fn(() => 123456789);

const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
      latestAgentMessageTimestamp: 40,
      disconnectTimeoutInMinutes: 50,
    }),
  }],
};

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'UserName',
        password: 'Password',
      }),
    }),
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: {
        InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
        LatestCustomerMessageTimestamp: 50,
      },
    }),
  }));

const mockDelete = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockGetSqsQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

axios.mockImplementation(() => ({
  data: {
    appId: '5e31c81640a22c000f5d7f28',
    artifactId: '5e31c81640a22c000f5d7f70',
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      delete: mockDelete,
    })),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetSqsQueueUrl,
    sendMessage: mockSendMessage,
  })),
}));

const { handler } = require('../index');

describe('smooch-client-disconnect-checker', () => {
  describe('Everything is successful', () => {
    it('returns when there is no active interaction for users', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '',
            LatestCustomerMessageTimestamp: 50,
          },
        }),
      }));
      const result = await handler(event);
      expect(mockGetSqsQueueUrl).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns when not disconnecting client', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f1',
            LatestCustomerMessageTimestamp: 50,
          },
        }),
      }));
      const result = await handler(event);
      expect(mockGetSqsQueueUrl).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('checking if the client is disconnected', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
            interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
            latestAgentMessageTimestamp: 40,
            disconnectTimeoutInMinutes: 3000,
          }),
        }],
      };
      const result = await handler(mockEvent);
      expect(mockGetSqsQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
        QueueName: 'us-east-1-dev-smooch-client-disconnect-checker',
      }]));
      expect(result).toBeUndefined();
    });

    it('when a customer disconnect is already received', async () => {
      jest.clearAllMocks();
      try {
        const error = {
          response: {
            status: 404,
          },
        };
        mockGet.mockImplementationOnce(() => ({
          promise: () => ({
            Item: {
              InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
              LatestCustomerMessageTimestamp: 0,
            },
          }),
        }));
        axios.mockRejectedValueOnce(error);
        await handler(event);
      } catch (err) {
        expect(mockDelete.mock.calls[0]).toEqual(expect.arrayContaining([{
          TableName: 'us-east-1-dev-smooch-interactions',
          Key: {
            SmoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
          },
          ConditionExpression: 'attribute_exists(SmoochUserId)',
        }]));
        expect(mockGetSqsQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
          QueueName: 'us-east-1-dev-create-messaging-transcript',
        }]));
      }
    });

    it('when there is a error removing the interaction id', async () => {
      jest.clearAllMocks();
      mockDelete.mockRejectedValueOnce(new Error());
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('when customer is inactive', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(mockDelete.mock.calls[0]).toEqual(expect.arrayContaining([{
        TableName: 'us-east-1-dev-smooch-interactions',
        Key: {
          SmoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
        },
        ConditionExpression: 'attribute_exists(SmoochUserId)',
      }]));
      expect(mockGetSqsQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
        QueueName: 'us-east-1-dev-create-messaging-transcript',
      }]));
    });

    it('when customer is inactive and the last customer message is older that latest agent message', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 10,
          },
        }),
      }));
      await handler(event);
      expect(mockDelete.mock.calls[0]).toEqual(expect.arrayContaining([{
        TableName: 'us-east-1-dev-smooch-interactions',
        Key: {
          SmoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
        },
        ConditionExpression: 'attribute_exists(SmoochUserId)',
      }]));
      expect(mockGetSqsQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
        QueueName: 'us-east-1-dev-create-messaging-transcript',
      }]));
    });

    it('when the customer is active', async () => {
      jest.clearAllMocks();
      await handler(event);
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockGetSqsQueueUrl).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('when transcript files are not created or files already exists', async () => {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          artifactId: '5e31c81640a22c000f5d7f70',
        },
      }));
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          artifactId: '5e31c81640a22c000f5d7f70',
        },
      }));
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          artifactId: '5e31c81640a22c000f5d7f70',
          files: [{
            metadata: {
              transcript: true,
            },
          }],
        },
      }));
      const result = await handler(event);
      expect(result).toBeUndefined();
    });
  });

  describe('Walkthrough', () => {
    it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
      jest.clearAllMocks();
      await handler(event);
      expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-cx',
      }]));
    });

    it('passes in the correct arguments to docClient.get() to get smooch interaction record', async () => {
      jest.clearAllMocks();
      await handler(event);
      expect(mockGet.mock.calls[0]).toEqual(expect.arrayContaining([{
        TableName: 'us-east-1-dev-smooch-interactions',
        Key: {
          SmoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
        },
      }]));
    });

    it('passes in the correct arguments to sqs.getQueueUrl() in checkIfClientIsDisconnected()', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
            interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
            latestAgentMessageTimestamp: 40,
            disconnectTimeoutInMinutes: 3000,
          }),
        }],
      };
      await handler(mockEvent);
      expect(mockGetSqsQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
        QueueName: 'us-east-1-dev-smooch-client-disconnect-checker',
      }]));
    });

    it('passes in the correct arguments to sqs.sendMessage() in checkIfClientIsDisconnected()', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
            interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
            latestAgentMessageTimestamp: 40,
            disconnectTimeoutInMinutes: 3000,
          }),
        }],
      };
      await handler(mockEvent);
      expect(mockSendMessage.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to axios in performCustomerDisconnect()', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(axios.mock.calls[0]).toMatchSnapshot();
    });

    it('passes in the correct arguments to docClient.delete() in deleteCustomerInteraction()', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(mockDelete.mock.calls[0]).toEqual(expect.arrayContaining([{
        TableName: 'us-east-1-dev-smooch-interactions',
        Key: {
          SmoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
        },
        ConditionExpression: 'attribute_exists(SmoochUserId)',
      }]));
    });

    it('passes in the correct arguments to axios in createMessagingTranscript()', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(axios.mock.calls[1]).toMatchSnapshot();
    });

    it('passes in the correct arguments to sqs.getQueueUrl in createMessagingTranscript()', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(mockGetSqsQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
        QueueName: 'us-east-1-dev-create-messaging-transcript',
      }]));
    });

    it('passes in the correct arguments to sqs.sendMessage in createMessagingTranscript()', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      await handler(event);
      expect(mockSendMessage.mock.calls).toMatchSnapshot();
    });
  });
  it('throws an error when there is a problem retrieving cx credentials', async () => {
    jest.clearAllMocks();
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem geting smooch interaction record', async () => {
    jest.clearAllMocks();
    try {
      mockGet.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Falied to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending customer interrupt', async () => {
    jest.clearAllMocks();
    try {
      const error = {
        response: {
          status: 400,
        },
      };
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 0,
          },
        }),
      }));
      axios.mockRejectedValueOnce(error);
      await handler(event);
    } catch (err) {
      expect(Promise.reject(new Error('Error sending customer interrupt'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
