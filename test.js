'use strict'

const path = require('path');

const expect = require('expect.js');
const AWS = require('aws-sdk-mock');

AWS.setSDK(path.resolve('node_modules/aws-sdk'));

const updater = require('./');

describe('ECS Service Image Updater', function() {
  it('should return the current task definition', function(done) {
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

    AWS.mock('ECS', 'describeTaskDefinition', function(params, cb) {
      expect(params.taskDefinition).to.equal(taskDefinitionArn);
      cb(null, { taskDefinition: { taskDefinitionArn: taskDefinitionArn } });
    });

    updater.currentTaskDefinition({ serviceName: serviceName }, function(err, taskDefintion) {
      expect(taskDefintion.taskDefinitionArn).to.equal(taskDefinitionArn);
      done();
    });
  });

  it('should update a task definition with a new image', function() {
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

  it('should register new task definition', function(done) {
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

  it('should update service to use new task definition', function(done) {
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
