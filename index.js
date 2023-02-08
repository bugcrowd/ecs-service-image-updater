'use strict';

const AWS = require('aws-sdk');
const async = require('async');
const _ = require('lodash');

// Set the default region to 'us-east-1' if not already set
if (!AWS.config.region) {
  AWS.config.update({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  });
}

var updater = function(options, cb) {
  async.waterfall([
    (next) => updater.currentTaskDefinition(options, next),
    (currentTaskDefinition, next) => {
      var newTaskDefinition = updater.updateTaskDefinitionImage(
        currentTaskDefinition,
        options.containerNames,
        options.image,
      );

      return updater.createTaskDefinition(newTaskDefinition, next);
    },
    (taskDefinition, next) => {
      if (!options.serviceName) return next(null, taskDefinition.taskDefinitionArn);
      return updater.updateService(options, taskDefinition.taskDefinitionArn, (err, service) => {
        return next(err, taskDefinition.taskDefinitionArn);
      });
    },
    (taskDefinitionArn, next) => {
      if (!options.wait) return next(null, taskDefinitionArn);
      return updater.waitForStableDeployment(options, (err, service) => {
        return next(err, taskDefinitionArn);
      });
    },
  ], cb);
};

Object.assign(updater, {
  /**
   * currentTaskDefinition
   *
   * Retrieve the currently deployed Task Definintion
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  currentTaskDefinition(options, cb) {
    var ecs = new AWS.ECS();

    if (!options.serviceName && !options.taskDefinitionFamily) {
      return cb(new Error('Ensure either the serviceName or taskDefinitionFamily option are specified'));
    }

    async.parallel([
      (done) => {
        if (!options.taskDefinitionFamily) return done();
        return updater.getLatestActiveTaskDefinition(options, done);
      },
      (done) => {
        if (!options.serviceName) return done();
        return updater.getServiceTaskDefinition(options, done);
      },
    ], (err, results) => {
      if (err) return cb(err);
      var taskDefinitionArn = _.filter(results, (result) => result)[0];
      if (!taskDefinitionArn) return cb(new Error('Error could not find task definition'));
      updater.getTaskDefinition(taskDefinitionArn, cb);
    });
  },

  /**
   * getServiceTaskDefinition
   *
   * Retrieve the active Task Definition Arn on a service
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  getServiceTaskDefinition(options, cb) {
    var ecs = new AWS.ECS();

    var params = {
      cluster: options.clusterArn,
      services: [options.serviceName],
    };

    ecs.describeServices(params, (err, data) => {
      if (err) return cb(err);

      var service = _.find(data.services, (s) => s.serviceName === options.serviceName);
      if (!service) return cb(new Error(`Could not find service "${options.serviceName}"`));

      cb(null, service.taskDefinition);
    });
  },

  /**
   * getLatestActiveTaskDefinition
   *
   * Retrieve the newest Task Definition Arn in a Task Definition Family
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  getLatestActiveTaskDefinition(options, cb) {
    var ecs = new AWS.ECS();

    var params = {
      familyPrefix: options.taskDefinitionFamily,
      sort: 'DESC',
      status: 'ACTIVE',
    };

    ecs.listTaskDefinitions(params, function(err, data) {
      if (err) return cb(err);
      if (data.taskDefinitionArns.length === 0) {
        return cb(new Error(`No Task Definitions found in family "${family}"`));
      }

      cb(err, data.taskDefinitionArns[0]);
    });
  },

  /**
   * getTaskDefinition
   *
   * Retrieve a task definition
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  getTaskDefinition(taskDefinitionArn, cb) {
    var ecs = new AWS.ECS();
    var params = { taskDefinition: taskDefinitionArn };

    ecs.describeTaskDefinition(params, (err, data) => {
      if (err) return cb(err);
      return cb(null, data.taskDefinition);
    });
  },

  updateTaskDefinitionImage(taskDefinition, containerNames, image) {
    if (!_.isArray(containerNames)) containerNames = [containerNames];

    var newTaskDefinition = _.clone(taskDefinition);
    containerNames.forEach((containerName) => {
      var containerIndex = _.findIndex(newTaskDefinition.containerDefinitions, (containerDefinition) => {
        return containerDefinition.name === containerName;
      });

      newTaskDefinition.containerDefinitions[containerIndex].image = image;
    });

    return _.pick(newTaskDefinition, [
      'containerDefinitions',
      'executionRoleArn',
      'family',
      'networkMode',
      'placementConstraints',
      'taskRoleArn',
      'volumes',
      'requiresCompatibilities',
      'cpu',
      'memory',
    ]);
  },

  /**
   * createTaskDefinition
   *
   * Create a new Task Definition based on the currently deployed
   * Task Definition but with an updated container image.
   *
   * @param {object} newTaskDefinition New task definition to create
   * @param {function} cb Callback
   */
  createTaskDefinition(newTaskDefinition, cb) {
    var ecs = new AWS.ECS();

    ecs.registerTaskDefinition(newTaskDefinition, (err, data) => {
      if (err) return cb(err);
      return cb(null, data.taskDefinition);
    });
  },

  /**
   * updateService
   *
   * Update the service to use a new Task Definition
   * @param {object} options A hash of options used when initiating this deployment
   * @param {sting} taskDefinitionArn The task definition to deploy
   * @param {function} cb Callback
   */
  updateService(options, taskDefinitionArn, cb) {
    var ecs = new AWS.ECS();
    var params = {
      cluster: options.clusterArn,
      service: options.serviceName,
      taskDefinition: taskDefinitionArn,
    };

    ecs.updateService(params, (err, data) => {
      if (err) return cb(err);
      cb(null, data.service);
    });
  },

  waitForStableDeployment(options, cb) {
    var ecs = new AWS.ECS();
    var params = {
      cluster: options.clusterArn,
      services: [options.serviceName],
    };

    ecs.waitFor('servicesStable', params, (err, data) => {
      if (err) return cb(err);
      cb(null, data.services[0]);
    });
  },
});

module.exports = updater;
