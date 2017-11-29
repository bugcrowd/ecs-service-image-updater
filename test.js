'use strict'

const path = require('path');

const expect = require('expect.js');
const AWS = require('aws-sdk-mock');

AWS.setSDK(path.resolve('node_modules/aws-sdk'));

const updater = require('./');

describe('ECS Service Image Updater', function() {
  var oldGetServiceTaskDefinition = updater.getServiceTaskDefinition;
  var oldGetLatestActiveTaskDefinition = updater.getLatestActiveTaskDefinition;
  var oldGetTaskDefinition = updater.getTaskDefinition;

  afterEach(() => {
    updater.getServiceTaskDefinition = oldGetServiceTaskDefinition;
    updater.getLatestActiveTaskDefinition = oldGetLatestActiveTaskDefinition;
    updater.getTaskDefinition = oldGetTaskDefinition;
  });

  it('currentTaskDefinition should return the current task definition from in Service', function(done) {
    var serviceName = 'planet-express';
    var taskDefinitionArn = 'arn::good-news:96';

    updater.getServiceTaskDefinition = function(options, cb) {
      return cb(null, taskDefinitionArn);
    };

    updater.getLatestActiveTaskDefinition = function(options, cb) {
      // should never be called
      expect(false).to.equal(true);
    };

    updater.getTaskDefinition = function(taskDefinitionArnSupplied, cb) {
      return cb(null, { taskDefinitionArn: taskDefinitionArn});
    };

    updater.currentTaskDefinition({ serviceName: serviceName }, function(err, taskDefintion) {
      expect(taskDefintion.taskDefinitionArn).to.equal(taskDefinitionArn);
      done();
    });
  });

  it('currentTaskDefinition should return the current task definition in a Task Definition Family', function(done) {
    var family = 'simpsons';
    var taskDefinitionArn = 'arn::good-news:96';

    updater.getServiceTaskDefinition = function(options, cb) {
      // should never be called
      expect(false).to.equal(true);
    };

    updater.getLatestActiveTaskDefinition = function(options, cb) {
      return cb(null, taskDefinitionArn);
    };

    updater.getTaskDefinition = function(taskDefinitionArnSupplied, cb) {
      return cb(null, { taskDefinitionArn: taskDefinitionArn});
    };

    updater.currentTaskDefinition({ taskDefinitionFamily: family }, function(err, taskDefintion) {
      expect(taskDefintion.taskDefinitionArn).to.equal(taskDefinitionArn);
      done();
    });
  });

  it('getServiceTaskDefinition should get the active task definition in Service', function(done) {
    var serviceName = 'planet-express';
    var taskDefinitionArn = 'arn::good-news:96';

    AWS.mock('ECS', 'describeServices', function(params, cb) {
      expect(params.services).to.eql([serviceName]);
      var data = {
        services: [
          { serviceName: '1', taskDefinition: 'arn' },
          { serviceName: serviceName, taskDefinition: taskDefinitionArn }
        ]
      }
      cb(null, data);
    });

    updater.getServiceTaskDefinition({ serviceName: serviceName }, function(err, taskDefintionArnReturned) {
      expect(taskDefintionArnReturned).to.equal(taskDefinitionArn);
      done();
    });
  });

  it('getLatestActiveTaskDefinition should get the latest task definition in a Task Definition Family', function(done) {
    var family = 'simpsons';

    AWS.mock('ECS', 'listTaskDefinitions', function(params, cb) {
      expect(params).to.eql({
        familyPrefix: family,
        sort: 'DESC',
        status: 'ACTIVE'
      });

      var data = {
        taskDefinitionArns: [
          "arn:2",
          "arn:1",
        ]
      }
      cb(null, data);
    });

    updater.getLatestActiveTaskDefinition({ taskDefinitionFamily: family }, function(err, taskDefintionArnReturned) {
      expect(taskDefintionArnReturned).to.equal("arn:2");
      done();
    });
  });

  it('getTaskDefinition should return a task definition', function(done) {
    var taskDefinitionArn = 'arn::good-news:96';

    AWS.mock('ECS', 'describeTaskDefinition', function(params, cb) {
      expect(params.taskDefinition).to.equal(taskDefinitionArn);
      cb(null, { taskDefinition: { taskDefinitionArn: taskDefinitionArn } });
    });

    updater.getTaskDefinition(taskDefinitionArn, function(err, taskDefintion) {
      expect(taskDefintion.taskDefinitionArn).to.equal(taskDefinitionArn);
      done();
    });
  });

  it('updateTaskDefinitionImage should update a task definition with a new image', function() {
    var container = 'app';
    var image = 'image:2';
    var taskDefinition = {
      taskDefinitionArn: 'arn',
      containerDefinitions: [
        {
          name: container,
          image: 'image:1'
        }
      ]
    };

    var updatedTaskDefinition = updater.updateTaskDefinitionImage(taskDefinition, container, image);
    expect(updatedTaskDefinition['containerDefinitions'][0]['image']).to.equal(image);
  });

  it('createTaskDefinition should register new task definition', function(done) {
    var taskDefinition = {
      family: 'boo',
      containerDefinitions: []
    };

    AWS.mock('ECS', 'registerTaskDefinition', function(newTaskDefinition, cb) {
      expect(newTaskDefinition).to.eql(taskDefinition);
      cb(null, { 'taskDefinition': newTaskDefinition });
    });

    updater.createTaskDefinition(taskDefinition, (err, taskDefinitionCreated) => {
      expect(err).to.equal(null);
      expect(taskDefinition).to.eql(taskDefinitionCreated);
      done();
    });
  });

  it('updateService should update Service to use new Task Definition', function(done) {
    AWS.mock('ECS', 'updateService', function(params, cb) {
      expect(params).to.eql({
        cluster: 'arn:cluster',
        service: 'serviceName',
        taskDefinition: 'arn:taskDefinition'
      });
      cb(null, { 'service': { serviceName: 'serviceName' } });
    });

    var options = {
      clusterArn: 'arn:cluster',
      serviceName: 'serviceName',
    };

    updater.updateService(options, 'arn:taskDefinition', (err, service) => {
      expect(err).to.equal(null);
      expect(service).to.eql({ serviceName: 'serviceName' });
      done();
    });
  });

  describe('Wrap up', function() {
    var oldCurrentTaskDefinitionFn = updater.currentTaskDefinition;
    var oldUpdateTaskDefinitionImageFn = updater.updateTaskDefinitionImage;
    var oldCreateTaskDefinitionFn = updater.createTaskDefinition;
    var oldUpdateServiceFn = updater.updateService;

    after(() => {
      updater.currentTaskDefinition = oldCurrentTaskDefinitionFn;
      updater.updateTaskDefinitionImage = oldUpdateTaskDefinitionImageFn;
      updater.createTaskDefinition = oldCreateTaskDefinitionFn;
      updater.updateService = oldUpdateServiceFn;
    });

    it('should do it all more good', function(done) {
      updater.currentTaskDefinition = function(optionsSupplied, cb) {
        expect(optionsSupplied).to.eql(options);
        cb(null, { taskDefinitionArn: 'arn' });
      };

      updater.updateTaskDefinitionImage = function(taskDefinition, containerName, image) {
        expect(taskDefinition.taskDefinitionArn).to.equal('arn');
        expect(containerName).to.equal('containerName');
        expect(image).to.equal('image:1');
        return { taskDefinitionArn: 'arn:updated' };
      };

      updater.createTaskDefinition = function(taskDefinition, cb) {
        expect(taskDefinition.taskDefinitionArn).to.equal('arn:updated');
        cb(null, { taskDefinitionArn: 'arn:created' });
      };

      updater.updateService = function(optionsSupplied, taskDefinitionArn, cb) {
        expect(optionsSupplied).to.eql(options);
        expect(taskDefinitionArn).to.equal('arn:created');
        cb(null, { taskDefinition: 'arn:created' });
      }

      var options = {
        clusterArn: 'arn:cluster',
        serviceName: 'serviceName',
        containerName: 'containerName',
        image: 'image:1'
      }

      updater(options, (err, deploy) => {
        expect(err).to.equal(null);
        done();
      });
    });
  });
});
