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
        SecretId: 'us-east-1-dev-smooch',
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

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
}));


jest.mock('smooch-core', () => jest.fn(() => ({
  appUsers: {
    getMessages: mockGetMessages,
  },
})));

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-smooch-api-url',
};

const { handler } = require('../index');

describe('get-conversation-history', () => {
  describe('Everthing is successful', () => {
    beforeAll(async () => {
      await handler(event);
    });
    it('passes in the correct arguments to mockGetSecretValue ', async () => {
      expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to mockGetMessages ', async () => {
      expect(mockGetMessages.mock.calls).toMatchSnapshot();
    });
  });
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
    mockGetMessages.mockImplementation(() => ({
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
    mockGetMessages.mockImplementation(() => ({
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
    mockGetMessages.mockImplementation(() => ({
      messages: [
        {
          role: 'appMaker',
          type: 'form',
          metadata: {
            type: 'agent',
            from: '',
          },
          fields: [{ label: 'collect-message' }],
        },
      ],
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 if there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 if there is a error retrieving cx credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          SecretId: 'us-east-1-dev-smooch',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error in retrieving the interaction metadata', async () => {
    axios.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
