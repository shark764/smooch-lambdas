const axios = require('axios');

jest.mock('axios');

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    'interaction-id': '66d83870-30df-4a3b-8801-59edff162040',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
    name: 'name',
  },
  body: {
    event: 'conversation-read',
  },
};

const mockConversationActivity = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    conversationActivity: mockConversationActivity,
  },
}));

const mockGetSecretValue = jest.fn(() => {})
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
    appId: '5e31c81640a22c000f5d7f28',
    userId: '5e31c81640a22c000f5d7f70',
    method: 'get',
    url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
  },
}));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('send-conversation-event', () => {
  describe('Everthing is successful', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    it("when userEvent is 'typing-start'", async () => {
      const typingStartEvent = {
        ...event,
        body: { event: 'typing-start' },
      };
      await handler(typingStartEvent);
      expect(mockConversationActivity.mock.calls[0][0].activityProps).toEqual({
        role: 'appMaker',
        type: 'typing:start',
      });
    });

    it("when userEvent is 'typing-stop'", async () => {
      const typingStopEvent = {
        ...event,
        body: { event: 'typing-stop' },
      };
      await handler(typingStopEvent);
      expect(mockConversationActivity.mock.calls[0][0].activityProps).toEqual({
        role: 'appMaker',
        type: 'typing:stop',
      });
    });

    it('sends back status 200 when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    describe('Walkthrough', () => {
      beforeEach(async () => {
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              '5e31c81640a22c000f5d7f28-id': 'id',
              '5e31c81640a22c000f5d7f28-secret': 'secret',
            }),
          }),
        }));
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              username: 'username',
              password: 'paasword',
            }),
          }),
        }));
        await handler(event);
      });
      it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-app',
        }]));
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-cx',
        }]));
        expect(mockGetSecretValue.mock.calls[1]).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios to get the interaction metadata', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.conversationActivity()', async () => {
        expect(mockConversationActivity.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving cx credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          '5e31c81640a22c000f5d7c55-id': 'id',
          '5e31c81640a22c000f5d7c55-secert': 'secret',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving interaction metadata', async () => {
    axios.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when the provided event is not supported', async () => {
    event.body.event = 'event';
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error sending conversation activity', async () => {
    event.body.event = 'conversation-read';
    mockConversationActivity.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error validating digital channels credentials', async () => {
    mockSmoochCore.mock.calls = null;
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
