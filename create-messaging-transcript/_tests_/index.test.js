const axios = require('axios');

jest.mock('axios');

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

const mockFormData = jest.fn(() => ({
  getHeaders: jest.fn(() => 'mock from headers'),
  append: jest.fn(FormData.append),
}));

global.FormData = mockFormData;

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'username',
        password: 'password',
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
    appId: '5e31c81640a22c000f5d7f28',
    userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
    customer: 'mock-customer',
    firstCustomerMessageTimestamp: 50,
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

const index = require('../index');

const spyOnUploadArtifactFile = jest.spyOn(index, 'uploadArtifactFile');

const { handler } = require('../index');

describe('create-messaging-transcript', () => {
  describe('Everything is successful', () => {
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
      expect(spyOnUploadArtifactFile.mock.calls[0][1]).toMatchSnapshot();
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
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[0][1]).toMatchSnapshot();
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
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[0][1]).toMatchSnapshot();
    });

    it('messages are filtered for previous timestamp', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{
          type: 'file',
          _id: '5e31c81640a22c000f5d7f28',
          role: 'appMaker',
          received: 150,
          metadata: {
            type: 'TYPE',
            from: 'first-Name last-Name',
          },
        }],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=50',
        messages: [{
          type: 'file',
          _id: '5e31c81640a22c000f5d7f28',
          role: 'appMaker',
          received: 99,
          metadata: {
            type: 'TYPE',
            from: 'first-Name last-Name',
          },
        }],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=10',
        messages: [{
          type: 'file',
          _id: '5e31c81640a22c000f5d7f28',
          role: 'appMaker',
          received: 15,
          metadata: {
            type: 'TYPE',
            from: 'first-Name last-Name',
          },
        }],
      }));
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[0][1]).toMatchSnapshot();
    });

    it('messages for whatsapp interaction use phonenumber as display name', async () => {
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          userId: '667802d8-2260-436c-958a-2ee0f71f73f2',
          customer: '+50371675753',
          firstCustomerMessageTimestamp: 50,
        },
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [
          {
            type: 'text',
            _id: '5e31c81640a22c000f5d7f29',
            role: 'appUser',
            received: 50,
            metadata: {
              type: 'TYPE',
              from: 'first-Name last-Name',
            },
          },
        ],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[4][1]).toMatchSnapshot();
    });

    it('messages from agent uses "name" from message object to display name', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [
          {
            type: 'text',
            _id: '5e31c81640a22c000f5d7f29',
            name: '+50371675753 lastName',
            role: 'appMaker',
            received: 50,
            metadata: {
              type: 'TYPE',
              from: 'first-Name last-Name',
            },
          },
        ],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[5][1]).toMatchSnapshot();
    });

    it('messages from agent uses "from" from metadata to display name', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [
          {
            type: 'text',
            _id: '5e31c81640a22c000f5d7f29',
            role: 'appMaker',
            received: 50,
            metadata: {
              type: 'TYPE',
              from: 'first-Name last-Name',
            },
          },
        ],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[6][1]).toMatchSnapshot();
    });

    it('messages from system shows "system" as display name', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [
          {
            type: 'text',
            _id: '5e31c81640a22c000f5d7f29',
            role: 'appMaker',
            received: 50,
            metadata: {
              type: 'TYPE',
            },
          },
        ],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[7][1]).toMatchSnapshot();
    });

    it('messages contains actions (shorthand message)', async () => {
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [
          {
            type: 'text',
            _id: '5e31c81640a22c000f5d7f29',
            role: 'appMaker',
            received: 50,
            metadata: {
              type: 'TYPE',
            },
            actions: [
              {
                _id: 'mock-id-1',
                text: 'mock button name 1',
                uri: 'https://www.domain.com',
              },
              {
                _id: 'mock-id-2',
                text: 'mock button name 2',
                uri: 'https://www.domain.com',
              },
            ],
          },
        ],
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com',
        messages: [],
      }));
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[8][1]).toMatchSnapshot();
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
      await handler(event);
      expect(spyOnUploadArtifactFile.mock.calls[0][1]).toMatchSnapshot();
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
      beforeEach(async () => {
        jest.clearAllMocks();
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              username: 'username',
              password: 'password',
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
        expect(mockGetSecretValue.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              SecretId: 'us-east-1-dev-smooch-cx',
            },
          ]),
        );
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
        expect(mockGetSecretValue.mock.calls[1]).toEqual(
          expect.arrayContaining([
            {
              SecretId: 'us-east-1-dev-smooch-app',
            },
          ]),
        );
        expect(mockGetSecretValue.mock.calls[1]).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.appUsers.getMessages()', async () => {
        expect(mockGetMessages.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios to get interaction metadata', async () => {
        expect(axios.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              auth: {
                password: 'password',
                username: 'username',
              },
              method: 'get',
              url:
                'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/metadata',
            },
          ]),
        );
        expect(axios.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios to push file to artifact', async () => {
        delete axios.mock.calls[1][0].data;
        expect(axios.mock.calls[1]).toEqual(
          expect.arrayContaining([
            {
              auth: { password: 'password', username: 'username' },
              headers: 'mock from headers',
              method: 'post',
              url:
                'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/artifacts/667802d8-2260-436c-958a-2ee0f71f73f1',
            },
          ]),
        );
        expect(axios.mock.calls[1]).toMatchSnapshot();
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
            password: 'password',
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
            password: 'password',
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
            password: 'password',
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
            password: 'password',
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
      axios.mockImplementationOnce(() => ({
        data: {
          files: [
            {
              metadata: {
                messageId: '5e31c81640a22c000f5d7f28',
              },
              method: 'post',
              url:
                'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/artifacts/667802d8-2260-436c-958a-2ee0f71f73f1',
            },
          ],
        },
      }));
      mockGetMessages.mockImplementationOnce(() => ({
        previous: 'https://www.unit-tests.com?before=100',
        messages: [{}],
      }));
      axios.mockRejectedValueOnce(new Error());
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
