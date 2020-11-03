const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('get-whatsapp-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API get-whatsapp-integration called successfully',
    },
  };
};
