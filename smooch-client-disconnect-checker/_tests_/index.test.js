global.Math.abs = jest.fn(() => 123456789);

const {
  checkIfClientIsDisconnected,
  disconnectClient,
} = require('../resources/commonFunctions');

jest.mock('../resources/commonFunctions');

checkIfClientIsDisconnected.mockImplementation(() => ({
  promise: () => ({}),
}));
disconnectClient.mockImplementation(() => ({
  promise: () => ({}),
}));

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

describe('smooch-client-disconnect-checker', () => {
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
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '',
            LatestCustomerMessageTimestamp: 50,
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toEqual('no interaction');
    });

    it('returns when not disconnecting client', async () => {
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f1',
            LatestCustomerMessageTimestamp: 50,
          },
        }),
      }));
      const result = await handler(event);
      expect(result).toEqual('old interaction');
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
      expect(checkIfClientIsDisconnected.mock.calls).toMatchSnapshot();
      expect(result).toEqual('checking if client disconnected');
    });

    it('when customer is active', async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
          },
        }),
      }));
      const result = await handler(event);
      expect(disconnectClient.mock.calls).toMatchSnapshot();
      expect(result).toEqual('disconnected client. no latest customer message timestamp.');
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
      const result = await handler(event);
      expect(disconnectClient.mock.calls).toMatchSnapshot();
      expect(result).toEqual('disconnected client. last customer message is older.');
    });

    it('when the customer is active', async () => {
      jest.clearAllMocks();
      const result = await handler(event);
      expect(checkIfClientIsDisconnected).not.toHaveBeenCalled();
      expect(disconnectClient).not.toHaveBeenCalled();
      expect(result).toEqual('customer is active');
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
});
