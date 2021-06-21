const axios = require('axios');
const { v1: uuidv1 } = require('uuid');

const { getMetadata } = require('../resources/commonFunctions');

jest.mock('axios');
jest.mock('uuid');

jest.mock('../resources/commonFunctions');
getMetadata.mockImplementation(() => ({
  data: {
    appId: '5e31c81640a22c000f5d7f28',
    userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
    customer: '+50371675753',
    firstCustomerMessageTimestamp: 50,
  },
}));

uuidv1.mockReturnValue('7534c040-534d-11ea-8aa0-c32d6a748e46');

const event = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
      'sub-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      'intercation-id': '667802d8-2260-436c-958a-2ee0f71f73f1',
      id: '5e31c81640a22c000f5d7f28',
      metadata: {
        'app-id': '5e31c81640a22c000f5d7f30',
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f8',
        participants: [{
          'resource-id': '250faddb-9723-403a-9bd5-3ca710cb26e0',
        }],
      },
      parameters: {
        from: 'from',
        text: 'text',
        message: {
          type: 'text',
          text: 'abc',
          actions:
            [
              {
                type: 'reply',
                text: 'reply text 1',
                payload: 'reply payload 1',
              },
              {
                type: 'reply',
                text: 'reply text 2',
                payload: 'reply payload 2',
              },
            ],
        },
      },
    }),
  }],
};

const mockCreateQueue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'new-queueurl',
    }),
  }));

const mockSqsGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'queueurl',
    }),
  }));

const mockSqsSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

axios.mockImplementation(() => ({
  promise: () => ({}),
}));

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'username',
        password: 'paasword',
      }),
    }),
  }))
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7f28-id': 'id',
        '5e31c81640a22c000f5d7f28-secret': 'secret',
      }),
    }),
  }));

const mockPostMessage = jest.fn()
  .mockImplementation(() => ({
    messages: {
      id: 'id',
      received: 1000,
      content: {
        text: 'text',
      },
    },
  }));

const mockAuthentication = {
  basicAuth: {
    username: 'id',
    password: 'secret',
  },
};

jest.mock('sunshine-conversations-client', () => ({
  ApiClient: {
    instance: {
      authentications: mockAuthentication,
    },
  },
  MessagesApi: jest.fn().mockImplementation(() => ({
    postMessage: mockPostMessage,
  })),
  MessagePost: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  SQS: jest.fn().mockImplementation(() => ({
    sendMessage: mockSqsSendMessage,
    createQueue: mockCreateQueue,
    getQueueUrl: mockSqsGetQueueUrl,
  })),
}));

const { handler } = require('../index');

describe('smooch-action-send-rich-message', () => {
  describe('Everthing is successful', () => {
    it('when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toBeUndefined();
    });
  });

  describe('Walkthrough', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
      mockSqsGetQueueUrl.mockImplementation(() => ({
        promise: () => ({
          QueueUrl: null,
        }),
      }));
      await handler(event);
    });
    it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
      expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-cx',
      }]));
    });

    it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
      expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-app',
      }]));
    });

    it('passes in the correct arguments to Smooch', async () => {
      expect(mockPostMessage.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to smooch.appUsers.sendMessage()', async () => {
      expect(mockPostMessage.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to sqs.getQueueUrl() in sendSqsMessage()', async () => {
      expect(mockSqsGetQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
        QueueName: '250faddb-9723-403a-9bd5-3ca710cb26e5_250faddb-9723-403a-9bd5-3ca710cb26e0',
      }]));
    });

    it('passes in the correct arguments to sqs.createQueue()', async () => {
      expect(mockCreateQueue.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to sqs.sendMessage() in sendSqsMessage()', async () => {
      expect(mockSqsSendMessage.mock.calls[0]).toMatchSnapshot();
    });

    it('passes in the correct arguments to sqs.getQueueUrl() in sendFlowActionResponse()', async () => {
      expect(mockSqsGetQueueUrl.mock.calls[1]).toEqual(expect.arrayContaining([{
        QueueName: 'us-east-1-dev-send-flow-response',
      }]));
    });

    it('passes in the correct arguments to sqs.sendMessage() in sendFlowActionResponse()', async () => {
      expect(mockSqsSendMessage.mock.calls[1]).toMatchSnapshot();
    });
  });
  it('throws an error when there is a problem retrieving cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            username: 'username',
            password: 'paasword',
          }),
        }),
      }));
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending smooch message to customer', async () => {
    try {
      mockPostMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending smooch message to customer'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws a warning when there is a error sending an error response', async () => {
    try {
      mockPostMessage.mockRejectedValueOnce(new Error());
      axios.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending smooch message and error response to customer'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem geting queue url', async () => {
    try {
      mockSqsGetQueueUrl.mockRejectedValueOnce(new Error());
      mockSqsSendMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error trying to get queue url'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem creating queue', async () => {
    try {
      mockSqsGetQueueUrl.mockImplementationOnce(() => ({
        promise: () => ({
          QueueUrl: null,
        }),
      }));
      mockCreateQueue.mockRejectedValueOnce(new Error());
      mockSqsSendMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error creating queue'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending message to SQS queue', async () => {
    try {
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
            'sub-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
            'intercation-id': '667802d8-2260-436c-958a-2ee0f71f73f1',
            id: '5e31c81640a22c000f5d7f28',
            metadata: {
              'app-id': '5e31c81640a22c000f5d7f30',
              'user-id': '667802d8-2260-436c-958a-2ee0f71f73f8',
              participants: {},
            },
            parameters: {
              from: 'from',
              text: 'text',
            },
          }),
        }],
      };
      await handler(mockEvent);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending message to SQS queue'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws a warning when there is a error sending an error response', async () => {
    try {
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
            'sub-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
            'intercation-id': '667802d8-2260-436c-958a-2ee0f71f73f1',
            id: '5e31c81640a22c000f5d7f28',
            metadata: {
              'app-id': '5e31c81640a22c000f5d7f30',
              'user-id': '667802d8-2260-436c-958a-2ee0f71f73f8',
              participants: {},
            },
            parameters: {
              from: 'from',
              text: 'text',
            },
          }),
        }],
      };
      axios.mockRejectedValueOnce(new Error());
      await handler(mockEvent);
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending message and response to SQS queue'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
