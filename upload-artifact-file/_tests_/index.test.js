const axios = require('axios');

jest.mock('axios');
jest.mock('form-data');

const mockGetSecretValue = jest.fn(() => { })
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'username',
        password: 'password',
      }),
    }),
  }));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: jest.fn().mockImplementation(() => ({ promise: jest.fn().mockImplementation(() => ({ QueueUrl: 'url://testurl' })) })),
    sendMessage: jest.fn().mockImplementation(() => ({ promise: jest.fn() })),
  })),
  config: {
    update: jest.fn(),
  },
}));

const agentEvent = {
  Records: [
    {
      body: JSON.stringify({
        source: 'agent',
        artifactId: '5e31c81640a22c000f5d7f28',
        interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
        tenantId: '66d83870-30df-4a3b-8801-59edff162034',
        fileData: {
          mediaUrl: 'http://example.com/image.jpg',
          filename: 'file.jpg',
          contentType: 'image/jpeg',
        },
        message: {
          id: '5e31c81640a22c000f5d7f33',
          text: 'test',
          type: 'agent',
          contentType: 'image',
          file: {
            mediaType: 'image/jpeg',
            mediaUrl: 'https://example.com/image.jpg',
          },
          from: 'Test',
          agentMessageId: '66d83870-30df-4a3b-8801-59edff162034',
          resourceId: '66d83870-30df-4a3b-8801-59edff161111',
          timestamp: 0,
        },
      }),
    },
  ],
};

const customerEvent = {
  Records: [
    {
      body: JSON.stringify({
        source: 'customer',
        artifactId: '5e31c81640a22c000f5d7f28',
        interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
        tenantId: '66d83870-30df-4a3b-8801-59edff162034',
        fileData: {
          mediaUrl: 'http://example.com/image1.jpg',
          filename: 'file.jpg',
          contentType: 'image/jpeg',
        },
        message: {
          _id: '5e31c81640a22c000f5d7f33',
          text: 'test',
          type: 'agent',
          contentType: 'image',
          mediaType: 'image/jpeg',
          mediaUrl: 'https://example.com/image1.jpg',
          from: 'Test',
          agentMessageId: '66d83870-30df-4a3b-8801-59edff162034',
          resourceId: '66d83870-30df-4a3b-8801-59edff161111',
          timestamp: 0,
        },
      }),
    },
  ],
};

axios.mockImplementation(() => ({
  data: Buffer.from('test'),
}));

const { handler } = require('../index');

describe('upload-artifact-file', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('Everything is successful', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('when message comes from smooch', async () => {
      await handler(customerEvent);
      expect(axios.mock.calls[0]).toEqual([{
        method: 'get',
        responseType: 'arraybuffer',
        url: 'https://example.com/image1.jpg',
      }]);
    });

    describe('Walkthrough', () => {
      beforeEach(async () => {
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              username: 'username',
              password: 'password',
            }),
          }),
        }));
        await handler(agentEvent);
      });
      it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-cx',
        }]));
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios to retrieve attachment', async () => {
        expect(axios.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios to upload the attachment file', async () => {
        delete axios.mock.calls[1][0].data;
        expect(axios.mock.calls[1]).toMatchSnapshot();
      });
    });
  });

  it('throws an error when there is a problem retrieving cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(customerEvent);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving attachment', async () => {
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(customerEvent);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving attachment'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem uploading artifact file', async () => {
    try {
      axios.mockImplementation((data) => {
        switch (data.url) {
          case 'https://example.com/image.jpg':
            return Promise.resolve({
              data: Buffer.from('test'),
            });
          case 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/artifacts/5e31c81640a22c000f5d7f28':
            return Promise.reject(new Error());
          default:
            return Promise.resolve({ data: {} });
        }
      });
      await handler(agentEvent);
    } catch (error) {
      expect(Promise.reject(new Error('Error uploading file to artifact'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
