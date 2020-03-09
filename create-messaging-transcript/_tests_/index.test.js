const axios = require('axios');

jest.mock('axios');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-smooch-api-url',
};

const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      artifactId: '667802d8-2260-436c-958a-2ee0f71f73f1',
      appId: '5e31c81640a22c000f5d7f28',
      userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
    }),
  }],
};

const mockFrom = jest.fn(Buffer.from);

const mockFormData = jest.fn(() => ({
  getHeaders: jest.fn(() => 'mock from headers'),
  append: jest.fn(FormData.append),
}));

global.FormData = mockFormData;
Buffer.from = mockFrom;
global.Buffer.toString = jest.fn(() => 'mock form');

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

axios.mockImplementation(() => ({
  data: {
    files: [{
      metadata: {
        messageId: '5e31c81640a22c000f5d7f28',
      },
      method: 'post',
      url: 'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/artifacts/667802d8-2260-436c-958a-2ee0f71f73f1',
    }],
  },
}));

const mockGetMessages = jest.fn();

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    getMessages: mockGetMessages,
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('create-messaging-transcript', () => {
  describe('Everthing is successful', () => {
    it("messages are filtered for type 'formResponse' and quotedMessage", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{
          _id: '5e31c81640a22c000f5d7f28',
          type: 'formResponse',
          received: 50,
          name: 'firstName lastName',
          quotedMessage: {
            content: {
              metadata: 'meta-data',
            },
          },
          fields: [{ text: 'collect-message response' }],
        }],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      await handler(event);
      expect(mockFrom.mock.calls[7]).toMatchSnapshot();
    });

    it("messages are filtered for role 'appUser' and type ''", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{
          _id: '5e31c81640a22c000f5d7f28',
          type: '',
          role: 'appUser',
          received: 50,
        }],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      jest.clearAllMocks();
      await handler(event);
      expect(mockFrom.mock.calls[7]).toMatchSnapshot();
    });

    it('messages are filtered for metadata', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{
          type: 'file',
          _id: '5e31c81640a22c000f5d7f28',
          role: 'appMaker',
          received: 50,
          metadata: {
            type: 'TYPE',
            from: 'first-Name last-Name',
          },
        }],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      jest.clearAllMocks();
      await handler(event);
      expect(mockFrom.mock.calls[7]).toMatchSnapshot();
    });

    it("messages are mapped for role 'appMaker' and type 'form'", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{
          name: 'firstName lastName',
          type: 'form',
          _id: '5e31c81640a22c000f5d7f28',
          role: 'appMaker',
          received: 50,
          metadata: {},
          fields: [{ label: 'collect-message' }],
        }],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      jest.clearAllMocks();
      await handler(event);
      expect(mockFrom.mock.calls[7]).toMatchSnapshot();
    });

    it('when there are no previous messages', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [{}],
      }));
      const result = await handler(event);
      expect(result).toBeUndefined();
    });

    it('when provided url for previous messages is invalid', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'unit-tests.com',
        messages: [{}],
      }));
      const result = await handler(event);
      expect(result).toBeUndefined();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              username: 'username',
              password: 'paasword',
            }),
          }),
        }));
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              '5e31c81640a22c000f5d7f28-id': 'id',
              '5e31c81640a22c000f5d7f28-secret': 'secret',
            }),
          }),
        }));
        mockGetMessages.mockImplementationOnce(() => ({
          previous: 'https://www.unit-tests.com?before=100',
          messages: [{}],
        }));
        mockGetMessages.mockImplementationOnce(() => ({
          previous: 'https://www.unit-tests.com',
          messages: [{}],
        }));
        await handler(event);
      });
      it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-cx',
        }]));
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
        expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-app',
        }]));
        expect(mockGetSecretValue.mock.calls[1]).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.getMessages()', async () => {
        expect(mockGetMessages.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
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
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            username: 'username',
            password: 'paasword',
          }),
        }),
      }));
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockSmoochCore.mockImplementationOnce(() => {
        throw new Error('SmoochCore');
      });
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem fetching integration messages', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            username: 'username',
            password: 'paasword',
          }),
        }),
      }));
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockGetMessages.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error fetching integration messages'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a error fetching previous interaction messages', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            username: 'username',
            password: 'paasword',
          }),
        }),
      }));
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{}],
      }));
      mockGetMessages.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error fetching previous integration messages'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is an error persisting artifact history', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            username: 'username',
            password: 'paasword',
          }),
        }),
      }));
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{}],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [{}],
      }));
      axios.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error persisting artifact history'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
