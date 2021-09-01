const { lambda: { api: { validateTenantPermissions } } } = require('alonzo');

jest.mock('alonzo');
jest.mock('serenova-js-utils/strings');

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

const mockCreate = jest.fn()
  .mockImplementation(() => ({
    data: {
      integration: {
        id: '667802d8-2260-436c-958a-2ee0f71f73f1',
        type: 'web',
        integrationOrder: 'integration-order',
        displayName: 'display-name',
        status: 'done',
        originWhitelist: ['url1', 'url2'],
        whitelistedUrls: [],
        prechatCapture: {
          fields: [{ name: 'name' }],
          enabled: true,
        },
      },
    },
  }));

const mockUpdate = jest.fn(() => ({}))
  .mockImplementation(() => ({
    promise: () => ({
      Attributes: {
        type: 'web',
        status: 'done',
      },
    }),
  }));

const mockBody = {
  appId: '5e31c81640a22c000f5d7f28',
  contactPoint: 'contact-point',
  prechatCapture: 'name',
  name: 'smooch',
  description: 'description',
  clientDisconnectMinutes: 150,
  brandColor: '1be54c',
  businessName: 'business-name',
  fixedIntroPane: true,
  conversationColor: 'cde51b',
  backgroundImageUrl: 'url',
  actionColor: 'e5711b',
  displayStyle: 'tab',
  buttonWidth: '50',
  buttonHeight: '50',
  buttonIconUrl: '50',
  whitelistedUrls: ['url1', 'url2'],
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

jest.mock('axios', () => mockCreate);

const { handler } = require('../index');

describe('create-smooch-web-integration', () => {
  describe('Everthing is successful', () => {
    it("when prechatCapture is equal to 'email'", async () => {
      jest.clearAllMocks();
      const mockEvent = {
        ...event,
        body: {
          ...mockBody,
          prechatCapture: 'email',
        },
      };
      await handler(mockEvent);
      expect(mockCreate.mock.calls[0][0].data.prechatCapture.fields).toEqual(
        expect.arrayContaining([{
          type: 'email',
          name: 'email',
          label: 'Email',
          placeholder: '',
          minSize: 1,
          maxSize: 128,
        }]),
      );
    });

    it("when prechatCapture is equal to 'none'", async () => {
      jest.clearAllMocks();
      const mockEvent = {
        ...event,
        body: {
          ...mockBody,
          prechatCapture: 'none',
        },
      };
      const result = await handler(mockEvent);
      expect(result).toMatchSnapshot();
    });

    it('when whitelistedUrls are passed to smooch as null when passed in body as empty array', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        ...event,
        body: {
          ...mockBody,
          whitelistedUrls: [],
        },
      };
      await handler(mockEvent);
      expect(mockCreate.mock.calls[0][0].data.originWhitelist).toEqual(null);
    });

    it('when brandColor, conversationColor, actionColor are provided', async () => {
      mockCreate.mockImplementationOnce(() => ({
        data: {
          integration: {
            id: '667802d8-2260-436c-958a-2ee0f71f73f1',
            brandColor: 'e51b1b',
            conversationColor: '2de51b',
            actionColor: '1b1be5',
            type: 'web',
            integrationOrder: 'integration-order',
            displayName: 'display-name',
            status: 'done',
            originWhitelist: ['url1', 'url2'],
            whitelistedUrls: [],
            prechatCapture: {
              fields: [{ name: 'name' }],
              enabled: true,
            },
          },
        },
      }));
      const { status } = await handler(event);
      expect(status).toBe(201);
    });

    it('when decription and client disconnect minutes are not provided', async () => {
      mockBody.description = '';
      mockBody.clientDisconnectMinutes = null;
      const { status } = await handler(event);
      expect(status).toBe(201);
    });

    it('sends back status 201 when the code runs without error', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
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

      it('passes in the correct arguments to axios smooch api call', async () => {
        expect(mockCreate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.update()', async () => {
        expect(mockUpdate.mock.calls).toMatchSnapshot();
      });
    });
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

  it('sends back status 500 when fails to parse credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error creating web integration for tenant', async () => {
    mockCreate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error saving records in DynamoDB for tenant', async () => {
    mockUpdate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
