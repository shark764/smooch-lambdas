const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('update-whatsapp-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API update-whatsapp-integration called successfully',
    },
  };
};
