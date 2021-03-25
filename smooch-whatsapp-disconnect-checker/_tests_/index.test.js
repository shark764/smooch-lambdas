global.DISCONNECT_TIMEOUT_MINUTES = 1440;
global.DELAY_MINUTES = 15;

const {
  checkIfClientPastInactiveTimeout,
  disconnectClient,
} = require('../resources/commonFunctions');

jest.mock('../resources/commonFunctions');
checkIfClientPastInactiveTimeout.mockImplementation(() => true);

disconnectClient.mockImplementation(() => ({
  promise: () => ({}),
}));
const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
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
        LatestWhatsappCustomerMessageTimestamp: 4,
      },
    }),
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
    })),
  },
}));

const { handler } = require('../index');

describe('smooch-whatsapp-disconnect-checker', () => {
  describe('Walkthrough', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
      await handler(event);
    });

    it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
      expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to docClient.get() to get smooch interaction record', async () => {
      expect(mockGet.mock.calls[0]).toEqual(expect.arrayContaining([{
        TableName: 'us-east-1-dev-smooch-interactions',
        Key: {
          SmoochUserId: '667802d8-2260-436c-958a-2ee0f71f73f2',
        },
      }]));
    });
  });

  describe('Everything is successful', () => {
    it('returns when there is no active interaction for users', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '',
            LatestWhatsappCustomerMessageTimestamp: 10,
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toEqual('no interaction');
    });

    it('returns when not disconnecting client', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f1',
            LatestWhatsappCustomerMessageTimestamp: 10,
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toEqual('old interaction');
    });

    it('delay disconnect using checkIfClientPastInactiveTimeout()', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
            interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
          }),
        }],
      };
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestWhatsappCustomerMessageTimestamp: (new Date() - (1000 * 60)),
          },
        }),
      }));
      const result = await handler(mockEvent);
      expect(checkIfClientPastInactiveTimeout.mock.calls).toMatchSnapshot();
      expect(result).toEqual('delaying disconnect');
    });

    it('disconnect with 1 minute left', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestWhatsappCustomerMessageTimestamp: (new Date() - (1000 * 60 * 1439)),
          },
        }),
      }));
      const result = await handler(event);
      expect(disconnectClient.mock.calls).toMatchSnapshot();
      expect(result).toEqual('customer disconnected');
    });

    it('disconnect after customer past timeout', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestWhatsappCustomerMessageTimestamp: 4,
          },
        }),
      }));
      const result = await handler(event);
      expect(disconnectClient.mock.calls).toMatchSnapshot();
      expect(result).toEqual('customer disconnected past timeout');
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

  it('throws an error when No customer timestamp is found', async () => {
    jest.clearAllMocks();
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: {
          InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      }),
    }));
    try {
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Customer Message Timestamp does not exists'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
