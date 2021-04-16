/* eslint-disable max-len */
const { lambda: { api: { validateTenantPermissions } } } = require('alonzo');
const axios = require('axios');

jest.mock('alonzo');
jest.mock('serenova-js-utils/strings');
jest.mock('axios');

validateTenantPermissions.mockReturnValue(true);
global.Date.prototype.toISOString = jest.fn(() => 'January 1 1970');

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7f28-id': 'id',
        '5e31c81640a22c000f5d7f28-secret': 'secret',
      }),
    }),
  }));


const mockCreateIntegration = jest.fn()
  .mockImplementation(() => ({
    integration: {
      id: '667802d812321342',
      type: 'messenger',
      displayName: 'display-name',
      pageName: 'page-name',
    },
  }));

const mockUpdate = jest.fn(() => ({}))
  .mockImplementation(() => ({
    promise: () => ({
      Attributes: {
        type: 'facebook',
        status: 'done',
      },
    }),
  }));

axios.mockImplementation(() => Promise.resolve({
  status: 200,
  data: {
    access_token: 'access-token',
  },
}));

const mockBody = {
  appId: '5e31c81640a22c000f5d7f28',
  name: 'smooch',
  facebookAppId: '5e31c81640a22c000f5d7f27',
  facebookAppSecret: '123457',
  facebookPageId: '12345678',
  facebookUserAccessToken: 'short-user-access-token',
  description: 'description',
  clientDisconnectMinutes: 150,
};

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
  body: mockBody,
};

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ update: mockUpdate })),
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
  IntegrationsApi: jest.fn().mockImplementation(() => ({
    createIntegration: mockCreateIntegration,
  })),
  Integration: jest.fn().mockImplementation(() => ({})),
}));

const { handler } = require('../index');

describe('create-faceboook-integration', () => {
  describe('Everthing is successful', () => {
    it('when decription and client disconnect minutes are not provided', async () => {
      mockBody.description = undefined;
      mockBody.clientDisconnectMinutes = undefined;
      const { status } = await handler(event);
      expect(status).toBe(201);
      expect(mockUpdate.mock.calls).toMatchSnapshot();
    });

    it('sends back status 201 when the code runs without error', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
      expect(axios.mock.calls).toMatchSnapshot();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretsClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to createIntegration()', async () => {
        expect(mockCreateIntegration.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.update()', async () => {
        expect(mockUpdate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('passes in the correct arguments to axios when facebook page access token is provided', async () => {
    jest.clearAllMocks();
    const body = {
      appId: '5e31c81640a22c000f5d7f28',
      name: 'smooch',
      facebookAppId: '5e31c81640a22c000f5d7f27',
      facebookAppSecret: '123457',
      facebookPageId: '12345678',
      facebookPageAccessToken: 'page-access-token',
      description: 'description',
      clientDisconnectMinutes: 150,
    };

    const mockEvent = {
      params: {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
      body,
    };
    await handler(mockEvent);
    expect(axios.mock.calls).toMatchSnapshot();
  });

  it('sends back status 400 when there is a invalid body value', async () => {
    const mockEvent = {
      params: {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
      body: {

      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there is a invalid params value', async () => {
    const mockEvent = {
      params: {
        id: '66d83870-30df-4a3b-8801-59edff162034',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
      body: mockBody,
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 403 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error creating facebook integration for tenant', async () => {
    mockCreateIntegration.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error saving records in DynamoDB for tenant', async () => {
    mockUpdate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when facebook api returns error while long lived user access token', async () => {
    jest.clearAllMocks();
    axios.mockImplementationOnce(new Error());
    mockBody.facebookPageAccessToken = undefined;
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when facebook api returns error while page access token', async () => {
    jest.clearAllMocks();
    axios.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      data: {
        access_token: 'access-token',
      },
    }));
    axios.mockImplementationOnce(new Error());
    mockBody.facebookPageAccessToken = undefined;
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when fails to parse credentials', async () => {
    jest.clearAllMocks();
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when facebook api for get app token returns error', async () => {
    jest.clearAllMocks();
    axios.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      data: {
        access_token: 'access-token',
      },
    }));
    axios.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      data: {
        access_token: 'access-token',
      },
    }));
    axios.mockImplementationOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when facebook api for delete subscription returns error', async () => {
    jest.clearAllMocks();
    axios.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      data: {
        access_token: 'access-token',
      },
    }));
    axios.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      data: {
        access_token: 'access-token',
      },
    }));
    axios.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      data: {
        access_token: 'access-token',
      },
    }));
    axios.mockImplementationOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when both user access token and page access token are missing', async () => {
    mockBody.facebookPageAccessToken = undefined;
    mockBody.facebookUserAccessToken = undefined;
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
