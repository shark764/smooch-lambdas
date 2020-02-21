const { validateTenantPermissions } = require('serenova-js-utils/lambda/api');

jest.mock('smooch-core/lib/api/integrations');
jest.mock('serenova-js-utils/lambda/api');
jest.mock('aws-sdk');
jest.mock('smooch-core/lib/smooch');

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        SecretId: 'us-east-1-dev-smooch',
      }),
    }),
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: [{ 'app-id': '5e31c81640a22c000f5d7f28', type: '' }],
    }),
  }));

validateTenantPermissions.mockReturnValue(true);

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    id: '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn().mockImplementation(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ get: mockGet })),
  },
}));

const mockGetIntegrations = jest.fn(() => ({
  integration: {
    brandColor: '#1b3de5',
    conversationColor: '#e53f1b',
    actionColor: '#1be54c',
    prechatCapture: {
      fields: [{ name: 'smooch' }],
    },
    originWhitelist: ['url1', 'url2'],
    whitelistedUrls: [],
    integrationOrder: '',
    _id: '667802d8-2260-436c-958a-2ee0f71f73f0',
    displayName: 'smooch',
    status: 'done',
    type: 'web',
  },
}));

jest.mock('smooch-core', () => jest.fn(() => ({
  integrations: {
    get: mockGetIntegrations,
  },
})));

beforeAll(() => {
  global.process.env = {
    AWS_REGION: 'us-east-1',
    ENVIRONMENT: 'dev',
    smooch_api_url: 'mock-smooch-api-url',
  };
});

const { handler } = require('../index');

describe('get-smooch-web-integration', () => {
  describe('Everything is successful', () => {
    let result;
    beforeAll(async () => {
      result = await handler(event);
    });
    it('sends back status 200 if the code runs without error', async () => {
      expect(result).toMatchSnapshot();
    });

    it('sends back arguments with which validateTenantPermissions was called', async () => {
      expect(validateTenantPermissions.mock.calls).toMatchSnapshot();
    });

    it('sends back arguments with which mockGetSecretValue was called', async () => {
      expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
    });

    it('sends back arguments with which mockGetIntegrations was called', async () => {
      expect(mockGetIntegrations.mock.calls).toMatchSnapshot();
    });
  });

  it('sends back a 400 error when there are invalid parameters', async () => {
    const mockevent = {
      params: {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockevent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 error when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving digital channels credentials ', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when the app does not exit for tenant', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error fetching the app in DynamoDB', async () => {
    mockGet.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error validating digital channels credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is error fetching web integration', async () => {
    mockGetIntegrations.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
