global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

const event = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      'interaction-id': '66d83870-30df-4a3b-8801-59edff162070',
      metadata: {
        'app-id': '5e31c81640a22c000f5d7f28',
        'user-id': '5e31c81640a22c000f5d7f90',
        source: 'web',
      },
      parameters: {
        message: 'message',
        from: 'from',
      },
      id: '5e31c81640a22c000f5d7f28',
      'sub-id': '5e31c81640a22c000f5d7f55',
    }),
  }],
};

const whatsappEvent = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      'interaction-id': '66d83870-30df-4a3b-8801-59edff162070',
      metadata: {
        'app-id': '5e31c81640a22c000f5d7f28',
        'user-id': '5e31c81640a22c000f5d7f90',
        source: 'whatsapp',
      },
      parameters: {
        message: 'message',
        from: 'from',
      },
      id: '5e31c81640a22c000f5d7f28',
      'sub-id': '5e31c81640a22c000f5d7f55',
    }),
  }],
};

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7f28-id': 'id',
        '5e31c81640a22c000f5d7f28-secret': 'secret',
      }),
    }),
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

const mockUpdate = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    sendMessage: mockSmoochSendMessage,
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetQueueUrl,
    sendMessage: mockSendMessage,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      update: mockUpdate,
    })),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('smooch-action-collect-message-response', () => {
  describe('Everthing is successful', () => {
    it('when action already exists in pending interaction', async () => {
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            'interaction-id': '66d83870-30df-4a3b-8801-59edff162070',
            metadata: {
              'app-id': '5e31c81640a22c000f5d7f28',
              'user-id': '5e31c81640a22c000f5d7f90',
              'collect-actions': [{
                'action-id': '5e31c81640a22c000f5d7f28',
              }],
              source: 'web',
            },
            parameters: {
              message: 'message',
              from: 'from',
            },
            id: '5e31c81640a22c000f5d7f28',
            'sub-id': '5e31c81640a22c000f5d7f55',
          }),
        }],
      };
      const result = await handler(mockEvent);
      expect(result).toBeUndefined();
    });

    it('returns nothing when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toBeUndefined();
    });

    it('when the message contains more than 128 characters', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            'interaction-id': '66d83870-30df-4a3b-8801-59edff162070',
            metadata: {
              'app-id': '5e31c81640a22c000f5d7f28',
              'user-id': '5e31c81640a22c000f5d7f90',
              source: 'web',
            },
            parameters: {
              message: 'messagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessagemessage',
              from: 'from',
            },
            id: '5e31c81640a22c000f5d7f28',
            'sub-id': '5e31c81640a22c000f5d7f55',
          }),
        }],
      };
      await handler(mockEvent);
      expect(mockSmoochSendMessage.mock.calls[0][0].message.fields[0].label).toMatchSnapshot();
    });

    it('Collect message for whatsapp', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            LatestCustomerMessageTimestamp: 50,
            CollectActions: [],
          },
        }),
      }));
      const result = await handler(whatsappEvent);
      expect(result).toBeUndefined();
    });

    it('Collect message for whatsapp no last customer message', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            CollectActions: [],
          },
        }),
      }));
      const result = await handler(whatsappEvent);
      expect(result).toBeUndefined();
    });

    it('Collect message for whatsapp old event', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162034',
            LatestCustomerMessageTimestamp: 50,
            CollectActions: [],
          },
        }),
      }));
      const result = await handler(whatsappEvent);
      expect(result).toBeUndefined();
    });

    it('Collect message for whatsapp no active interaction', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
          },
        }),
      }));
      const result = await handler(whatsappEvent);
      expect(result).toBeUndefined();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });

      it('passes in the correct arguments to sqs.getQueueUrl()', async () => {
        expect(mockGetQueueUrl.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to sqs.sendMessage()', async () => {
        expect(mockSendMessage.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.sendMessage()', async () => {
        expect(mockSmoochSendMessage.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('throws an error when there is a problem updating interaction metadata', async () => {
    try {
      mockGetQueueUrl.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error updating interaction metadata'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials', async () => {
    try {
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

  it('throws an error when there is a problem sending collect-message', async () => {
    try {
      mockSmoochSendMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending collect-message'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending whatsapp collect-message', async () => {
    try {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            LatestCustomerMessageTimestamp: 50,
            CollectActions: [{ actionId: '5e31c81640a22c000f5d7f28', subId: '5e31c81640a22c000f5d7f55' }],
          },
        }),
      }));
      mockSmoochSendMessage.mockRejectedValueOnce(new Error());
      await handler(whatsappEvent);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending Whatsapp collect message'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem updating collectActions', async () => {
    try {
      mockUpdate.mockRejectedValueOnce(new Error());
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            LatestCustomerMessageTimestamp: 50,
            CollectActions: [{ actionId: '5e31c81640a22c000f5d7f28', subId: '5e31c81640a22c000f5d7f55' }],
          },
        }),
      }));
      await handler(whatsappEvent);
    } catch (error) {
      expect(Promise.reject(new Error('An error ocurred updating collectActions'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});

it('throws an error when there is a problem getting collectActions', async () => {
  try {
    mockGet.mockRejectedValueOnce(new Error());
    await handler(whatsappEvent);
  } catch (error) {
    expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
  }
});
