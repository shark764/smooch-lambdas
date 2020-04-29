const uuidv1 = require('uuid/v4');

jest.mock('uuid/v4');

global.Date.prototype.toISOString = jest.fn(() => 'January 1 1970');

uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e46');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  ACCOUNT_ID: '667802d8-2260-436c-958a-2ee0f71f73f7',
};

const mockPublish = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

jest.mock('aws-sdk', () => ({
  SNS: jest.fn().mockImplementation(() => ({ publish: mockPublish })),
}));

const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      topic: 'agent-message',
      appName: 'smooch',
      resourceId: '667802d8-2260-436c-958a-2ee0f71f73f2',
    }),
  }],
};

const { handler } = require('../index');

describe('send-reporting-event', () => {
  describe('Everthing is successful', () => {
    it('when the provided topic is customer-message', async () => {
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
            interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            topic: 'customer-message',
            appName: 'smooch',
            resourceId: '667802d8-2260-436c-958a-2ee0f71f73f2',
          }),
        }],
      };
      await handler(mockEvent);
      expect(mockPublish.mock.calls[0]).toMatchSnapshot();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
      it('passes in the correct arguments to sns.publish()', async () => {
        expect(mockPublish.mock.calls).toMatchSnapshot();
      });
    });
  });
  it('throws an error when there is a problem sending reporting event', async () => {
    try {
      mockPublish.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error Sending Reporting Event'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when the topic received are not supported', async () => {
    try {
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
            interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            topic: 'topic',
            appName: 'smooch',
            resourceId: '667802d8-2260-436c-958a-2ee0f71f73f2',
          }),
        }],
      };
      await handler(mockEvent);
    } catch (error) {
      expect(error.message).toBe('Topic received not supported');
    }
  });
});
