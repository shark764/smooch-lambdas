const axios = require('axios');
const uuidv1 = require('uuid/v1');

jest.mock('axios');
jest.mock('uuid/v1');

uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e46');
global.Date.now = jest.fn(() => 'January 1 1970');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-smooch-api-url',
};

const mockGetSecretValue = jest.fn()
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

const mockSmoochSendMessage = jest.fn()
  .mockImplementation(() => ({}));

const mockSmoochCore = jest.fn(() => ({
  appUsers: { sendMessage: mockSmoochSendMessage },
}));

const mockGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'queueurl',
    }),
  }));

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

axios.mockImplementation(() => ({
  method: 'get',
  url: 'http://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/users/5e31c81640a22c000f5d7f30',
  data: {
    result: {
      firstName: 'first-name',
    },
  },
}));

const event = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
      'interaction-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      'sub-id': '667802d8-2260-436c-958a-2ee0f71f73f1',
      metadata: {
        appId: '5e31c81640a22c000f5d7f28',
        'user-id': '5e31c81640a22c000f5d7f30',
        participants: [{
          resourceId: '5e31c81640a22c000f5d7f33',
          sessionId: '667802d8-2260-436c-958a-2ee0f71f73f7',
        }],
      },
      parameters: {
        resource: {
          'user-id': '5e31c81640a22c000f5d7f33',
          'session-id': '667802d8-2260-436c-958a-2ee0f71f73f7',
        },
      },
    }),
  }],
};

jest.mock('smooch-core', () => mockSmoochCore);

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetQueueUrl,
    sendMessage: mockSendMessage,
  })),
}));

const index = require('../index');

const { handler } = index;

describe('smooch-action-add-participant', () => {
  describe('Everything is successful', () => {
    it('sends back nothing when the code runs without an error', async () => {
      const result = await handler(event);
      expect(result).toBeUndefined();
    });

    it('continues when there is an error sending message to participants', async () => {
      jest.spyOn(index, 'sendMessageToParticipant').mockImplementationOnce(() => { throw new Error(); });
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'interaction-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
            'sub-id': '667802d8-2260-436c-958a-2ee0f71f73f1',
            metadata: {
              participants: [],
            },
            parameters: {
              resource: {
              },
            },
          }),
        }],
      };
      await handler(mockEvent);
    });
    describe('Walkthrough', () => {
      beforeEach(async () => {
        jest.clearAllMocks();
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

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.getQueueUrl() in updateInteractionMetadata()', async () => {
        expect(mockGetQueueUrl.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.sendMessage() in updateInteractionMetadata()', async () => {
        expect(mockSendMessage.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.getQueueUrl() in sendMessageToParticipant()', async () => {
        expect(mockGetQueueUrl.mock.calls[1]).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.sendMessage() in sendMessageToParticipant()', async () => {
        expect(mockSendMessage.mock.calls[1]).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.sendMessage()', async () => {
        expect(mockSmoochSendMessage.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.getQueueUrl() in sendFlowActionResponse()', async () => {
        expect(mockGetQueueUrl.mock.calls[3]).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.sendMessage() in sendFlowActionResponse()', async () => {
        expect(mockSendMessage.mock.calls[3]).toMatchSnapshot();
      });
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
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials (thrown by SmoochCore)', async () => {
    try {
      mockSmoochCore.mockImplementationOnce(() => {
        throw new Error('SmoochCore');
      });
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a error fetching user information', async () => {
    const mockEvent = {
      Records: [{
        body: JSON.stringify({
          'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
          'interaction-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
          'sub-id': '667802d8-2260-436c-958a-2ee0f71f73f1',
          metadata: {
            appId: '5e31c81640a22c000f5d7f28',
            'user-id': '5e31c81640a22c000f5d7f30',
            participants: [{
              resourceId: '5e31c81640a22c000f5d7f34',
            }],
          },
          parameters: {
            resource: {
              'user-id': '5e31c81640a22c000f5d7f33',
              'session-id': '667802d8-2260-436c-958a-2ee0f71f73f7',
            },
          },
        }),
      }],
    };
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(mockEvent);
    } catch (error) {
      expect(Promise.reject(new Error('Error fetching user information'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem updating interaction metadata', async () => {
    try {
      mockSendMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error updating interaction metadata'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending message', async () => {
    try {
      mockSmoochSendMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error occurred sending message'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
