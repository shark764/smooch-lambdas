const axios = require('axios');

jest.mock('aws-sdk');
jest.mock('axios');

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    'interaction-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
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

const mockGetMessages = jest.fn()
  .mockImplementation(() => ({
    messages: [
      {
        type: '',
        _id: '',
        role: '',
        metadata: {
          resourceId: '',
        },
        from: '',
        mediaUrl: 'url1',
        mediaType: 'txt',
        mediaSize: '100kb',
        received: '50',
      },
    ],
  }));

axios.mockImplementation(() => ({
  data: {
    appId: '5e31c81640a22c000f5d7f28',
    userId: '667802d8-2260-436c-958a-2ee0f71f73f1',
    customer: 'mock-customer',
  },
}));

const mockSmoochCore = jest.fn().mockImplementation(() => ({
  appUsers: {
    getMessages: mockGetMessages,
  },
}));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
}));


jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('get-conversation-history', () => {
  describe('Everthing is successful', () => {
    it("messages are filtered for type 'formResponse' and quoted messages and are also mapped for type 'formResponse'", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            type: 'formResponse',
            quotedMessage: {
              content: {
                metadata: 'meta-data',
              },
            },
            fields: [{ text: 'collect-message response' }],
            textFallback: 'collect-message response',
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it("messages are filtered for role 'appUser' and type not equal to 'formResponse'", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            type: '',
            role: 'appUser',
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('messages are filtered for metadata', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            metadata: {
              resourceId: '66d83870-30df-4a3a-8801-59edff162037',
              from: '',
            },
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when no filter is applied', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            role: '',
            type: '',
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it("messages are mapped for the role 'appMaker'", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            role: 'appMaker',
            metadata: {
              type: 'agent',
              from: '',
            },
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it("messages are mapped for the role not equal to 'appMaker'", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            role: '',
            metadata: {},
            text: 'normal messages',
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it("messages are mapped for the role 'appMaker' and type 'form'", async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        messages: [
          {
            role: 'appMaker',
            type: 'form',
            metadata: {
              type: 'agent',
              from: '',
            },
            fields: [{ label: 'collect-message', name: 'collect-message' }],
          },
        ],
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to secretsClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.getMessages()', async () => {
        expect(mockGetMessages.mock.calls).toMatchSnapshot();
      });
    });
  });
  it('sends back status 500 when there is a problem fetching interaction messages', async () => {
    mockGetMessages.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 if there is an error retrieving digital channels credentials (error by SmoochCore)', async () => {
    mockSmoochCore.mockImplementationOnce(() => {
      throw new Error('SmoochCore');
    });
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 if there is an error retrieving cx credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          '5e31c81640a22c000f5d7f28-id': 'id',
          '5e31c81640a22c000f5d7f28-secret': 'secret',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error in retrieving the interaction metadata', async () => {
    axios.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials (error by getSecretValue())', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
