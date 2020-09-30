/* eslint-disable max-len */
const { lambda: { api: { validateTenantPermissions } } } = require('alonzo');

jest.mock('alonzo');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  smooch_api_url: 'mock-amooch-api-url',
};

validateTenantPermissions.mockReturnValue(true);

const mockBody = {
  name: 'name',
  prechatCapture: 'name',
  contactPoint: 'contact-Point',
  description: 'Description',
  clientDisconnectMinutes: 100,
  brandColor: '1b1be5',
  businessName: 'business-Name',
  businessIconUrl: 'business-Icon-Url',
  fixedIntroPane: true,
  conversationColor: '3ae51b',
  backgroundImageUrl: 'image-url',
  actionColor: 'e5a51b',
  displayStyle: 'button',
  buttonWidth: '50',
  buttonHeight: '50',
  buttonIconUrl: 'button-icon-url',
  appId: '5e31c81640a22c000f5d7c70',
  whitelistedUrls: [],
};

const mockParams = {
  'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  id: '5e31c81640a22c000f5d7c71',
  'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  'remote-addr': 'remote-address',
  auth: 'given-auth',
};

const event = {
  body: mockBody,
  params: mockParams,
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7c80-id': 'id',
        '5e31c81640a22c000f5d7c80-secret': 'secret',
      }),
    }),
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: {
        'app-id': '5e31c81640a22c000f5d7c80',
      },
    }),
  }));

const mockSmoochUpdate = jest.fn()
  .mockImplementation(() => ({
    integration: {
      brandColor: '1b1be5',
      conversationColor: '3ae51b',
      actionColor: 'e5a51b',
      integrationOrder: 'integration-order',
      _id: '5e31c81640a22c000f5d7c80',
      displayName: 'display-Name',
      status: 'done',
      type: 'type',
      originWhitelist: ['url1', 'url2'],
      whitelistedUrls: [],
      prechatCapture: {
        fields: [{ name: 'name' }],
        enabled: true,
      },
    },
  }));

const mockUpdate = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Attributes: {
        status: 'done',
        type: 'type',
      },
    }),
  }));

const mockSmoochCore = jest.fn(() => ({
  integrations: {
    update: mockSmoochUpdate,
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

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
      update: mockUpdate,
    })),
  },
}));

const { handler } = require('../index');

describe('update-smooch-web-integration', () => {
  describe('Everthing is successful', () => {
    it('sends back status 201 when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it("when preChatCapture is equal to 'email'", async () => {
      jest.clearAllMocks();
      const MockBody = {
        ...mockBody,
        prechatCapture: 'email',
      };
      const mockEvent = {
        body: MockBody,
        params: mockParams,
        identity: {
          'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      };
      await handler(mockEvent);
      expect(mockSmoochUpdate.mock.calls[0][0].props.prechatCapture).toEqual(
        {
          enabled: true,
          fields: [
            {
              label: 'Email',
              maxSize: 128,
              minSize: 1,
              name: 'email',
              placeholder: '',
              type: 'email',
            }],
        },
      );
    });

    it("when preChatCapture is equal to 'none'", async () => {
      jest.clearAllMocks();
      const MockBody = {
        ...mockBody,
        prechatCapture: 'none',
      };
      const mockEvent = {
        body: MockBody,
        params: mockParams,
        identity: {
          'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      };
      await handler(mockEvent);
      expect(mockSmoochUpdate.mock.calls[0][0].props.prechatCapture).toEqual({ enabled: false });
    });

    it('when brandcolor, conversationColor and actioncolor are not provided', async () => {
      mockSmoochUpdate.mockImplementationOnce(() => ({
        integration: {
          integrationOrder: 'integration-order',
          _id: '5e31c81640a22c000f5d7c80',
          displayName: 'display-Name',
          status: 'done',
          type: 'type',
          originWhitelist: ['url1', 'url2'],
          whitelistedUrls: [],
          prechatCapture: {
            fields: [{ name: 'name' }],
            enabled: true,
          },
        },
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('when name, description and contactPoint are not provided', async () => {
      const MockBody = {
        prechatCapture: 'name',
        clientDisconnectMinutes: 100,
        brandColor: '1b1be5',
        businessName: 'business-Name',
        businessIconUrl: 'business-Icon-Url',
        fixedIntroPane: true,
        conversationColor: '3ae51b',
        backgroundImageUrl: 'image-url',
        actionColor: 'e5a51b',
        displayStyle: 'button',
        buttonWidth: '50',
        buttonHeight: '50',
        buttonIconUrl: 'button-icon-url',
        appId: '5e31c81640a22c000f5d7c70',
      };
      const mockEvent = {
        body: MockBody,
        params: mockParams,
        identity: {
          'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      };
      const result = await handler(mockEvent);
      expect(result).toMatchSnapshot();
    });

    it('when clientDisconnectMinutes is undefined', async () => {
      const MockBody = {
        ...mockBody,
        clientDisconnectMinutes: undefined,
      };
      const mockEvent = {
        body: MockBody,
        params: mockParams,
        identity: {
          'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      };
      const result = await handler(mockEvent);
      expect(result).toMatchSnapshot();
    });

    it('when name or description is not provided', async () => {
      const MockBody = {
        ...mockBody,
        name: undefined,
        description: undefined,
      };
      const mockEvent = {
        body: MockBody,
        params: mockParams,
        identity: {
          'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      };
      const result = await handler(mockEvent);
      expect(result).toMatchSnapshot();
    });

    it('when description is provided but name is not provided', async () => {
      const MockBody = {
        ...mockBody,
        name: undefined,
      };
      const mockEvent = {
        body: MockBody,
        params: mockParams,
        identity: {
          'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
        },
      };
      const result = await handler(mockEvent);
      expect(result).toMatchSnapshot();
    });
    describe('Walkthrough', () => {
      beforeEach(async () => {
        jest.clearAllMocks();
        await handler(event);
      });

      it('passes in the correct arguments to secretsClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.get()', async () => {
        expect(mockGet.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.integrations.update()', async () => {
        expect(mockSmoochUpdate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.update()', async () => {
        expect(mockUpdate.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('sends back status 400 when there are invalid body value', async () => {
    const mockEvent = {
      body: {},
      params: mockParams,
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there are invalid params value', async () => {
    const mockEvent = {
      body: mockBody,
      params: {
        'tenant-id': '',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when the app does not exist for the tenant', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error fetching an app in DynamoDB', async () => {
    mockGet.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends backs status 500 when there is a error validating digital channels credentials', async () => {
    mockSmoochCore.mockImplementationOnce(() => {
      throw new Error('SmoochCore');
    });
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error updating a web integration', async () => {
    mockSmoochUpdate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error trying to save a record in DynamoDB', async () => {
    mockUpdate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
