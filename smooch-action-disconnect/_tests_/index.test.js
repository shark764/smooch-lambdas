const axios = require('axios');

jest.mock('axios');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

global.Date.prototype.getTime = jest.fn(() => '00:00:00');

const stringifyBody = {
  'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  'interaction-id': '66d83870-30df-4a3b-8801-59edff162070',
  'sub-id': '5e31c81640a22c000f5d7f55',
  metadata: {
    'app-id': '5e31c81640a22c000f5d7f28',
    'user-id': '5e31c81640a22c000f5d7f90',
    'artifact-id': '5e31c81640a22c000f5d7f95',
    participants: [{
      'resource-id': '66d83870-30df-4a3b-8801-59edff162080',
    }],
  },
  parameters: {
    message: 'message',
    from: 'from',
    resource: {
      id: '66d83870-30df-4a3b-8801-59edff162080',
    },
  },
};

const withResources = {
  Records: [{
    body: JSON.stringify(stringifyBody),
  }],
};

axios.mockImplementation(() => ({}));

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

const mockDelete = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'queueurl',
    }),
  }));

const mockSqsSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({}));

const mockSmoochCore = jest.fn(() => ({
  appUsers: { sendMessage: mockSendMessage },
}));

const mockupdate = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
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
      delete: mockDelete,
      update: mockupdate,
    })),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetQueueUrl,
    sendMessage: mockSqsSendMessage,
  })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('smooch-action-disconnect', () => {
  beforeAll(() => {
    jest.clearAllMocks();
  });
  describe('Everthing is successful', () => {
    it('returns nothing when the the code runs without any error', async () => {
      const result = await handler(withResources);
      expect(result).toBeUndefined();
    });

    it('returns when there is a error removing interaction id on the state table', async () => {
      const mockWithoutResources = {
        Records: [{
          body: JSON.stringify({
            ...stringifyBody,
            parameters: {},
          }),
        }],
      };
      mockDelete.mockRejectedValueOnce(new Error());
      const result = await handler(mockWithoutResources);
      expect(result).toBeUndefined();
    });

    it('returns when there is a error sending message to agents', async () => {
      const mockWithoutResources = {
        Records: [{
          body: JSON.stringify({
            ...stringifyBody,
            metadata: {
              'app-id': '5e31c81640a22c000f5d7f28',
              'user-id': '5e31c81640a22c000f5d7f90',
              'artifact-id': '5e31c81640a22c000f5d7f95',
            },
            parameters: {
              message: 'message',
              from: 'from',
            },
          }),
        }],
      };
      const result = await handler(mockWithoutResources);
      expect(result).toBeUndefined();
    });

    it('when participant does not exists', async () => {
      const mockWithoutResources = {
        Records: [{
          body: JSON.stringify({
            ...stringifyBody,
            parameters: {
              message: 'message',
              from: 'from',
              resource: {
                id: '66d83870-30df-4a3b-8801-59edff162081',
              },
            },
          }),
        }],
      };
      await handler(mockWithoutResources);
      expect(mockGetQueueUrl).toHaveBeenCalled();
    });

    it('when there is an error reseting the customer disconnect timer', async () => {
      mockupdate.mockRejectedValueOnce(new Error());
      const result = await handler(withResources);
      expect(result).toBeUndefined();
    });

    describe('Walkthrough', () => {
      describe('when no resource attachments are provided', () => {
        beforeAll(async () => {
          jest.clearAllMocks();
          const mockWithoutResources = {
            Records: [{
              body: JSON.stringify({
                ...stringifyBody,
                parameters: {
                  message: 'message',
                  from: 'from',
                },
              }),
            }],
          };
          await handler(mockWithoutResources);
        });
        it('passes in the correct arguments to docClient.delete()', async () => {
          expect(mockDelete).toHaveBeenCalled();
          expect(mockDelete.mock.calls).toMatchSnapshot();
        });

        it('passes in the correct arguments to sqs.getQueueUrl() in createMessagingTranscript()', async () => {
          expect(mockGetQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
            QueueName: 'us-east-1-dev-create-messaging-transcript',
          }]));
        });

        it('passes in the correct arguments to sqs.sendMessage() in createMessagingTranscript()', async () => {
          expect(mockSqsSendMessage.mock.calls[0]).toMatchSnapshot();
        });
      });

      describe('when resource attachments are provided', () => {
        beforeAll(async () => {
          jest.clearAllMocks();
          await handler(withResources);
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

        it('making sure docClient.delete() is not called', async () => {
          expect(mockDelete).not.toHaveBeenCalled();
        });

        it('passes in the correct arguments to sqs.getQueueUrl() in updateInteractionMetadata()', async () => {
          expect(mockGetQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
            QueueName: 'us-east-1-dev-update-interaction-metadata',
          }]));
        });

        it('passes in the correct arguments to sqs.sendMessage() in updateInteractionMetadata()', async () => {
          expect(mockSqsSendMessage.mock.calls[0]).toMatchSnapshot();
        });

        it('passes in the correct arguments to smooch.appUsers.sendMessage()', async () => {
          expect(mockSendMessage.mock.calls).toMatchSnapshot();
        });

        it('passes in the correct arguments to sqs.getQueueUrl() in sendFlowActionResponse()', async () => {
          expect(mockGetQueueUrl.mock.calls[1]).toEqual(expect.arrayContaining([{
            QueueName: 'us-east-1-dev-send-flow-response',
          }]));
        });

        it('passes in the correct arguments to sqs.sendMessage() in sendFlowActionResponse()', async () => {
          expect(mockSqsSendMessage.mock.calls[1]).toMatchSnapshot();
        });

        it('passes in the correct arguments to doclient.update()', async () => {
          expect(mockupdate.mock.calls).toMatchSnapshot();
        });
      });
    });
  });
  it('throws an error when there is a problem retrieving cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(withResources);
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
      await handler(withResources);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials (thrown by SmoochCore)', async () => {
    try {
      mockSmoochCore.mockImplementationOnce(() => {
        throw new Error('SmoochCore');
      });
      await handler(withResources);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem updating interaction metadata', async () => {
    try {
      mockGetQueueUrl.mockRejectedValueOnce(new Error());
      await handler(withResources);
    } catch (error) {
      expect(Promise.reject(new Error('Error updating interaction metadata'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending message', async () => {
    try {
      mockSendMessage.mockRejectedValueOnce(new Error());
      await handler(withResources);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending message'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending resource interrupt', async () => {
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(withResources);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending resource interrupt'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
