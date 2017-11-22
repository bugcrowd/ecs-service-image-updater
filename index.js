'use strict'

const AWS = require('aws-sdk');
const async = require('async');
const _ = require('lodash');

// Set the default region to 'us-east-1' if not already set
if (!AWS.config.region) {
  AWS.config.update({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
  });
}

var updater = function(options, cb) {
  async.waterfall([
    (next) => updater.currentTaskDefinition(options, next),
    (currentTaskDefinition, next) => {
      var newTaskDefinition = updater.updateTaskDefinitionImage(
        currentTaskDefinition,
        options.containerName,
        options.image
      );

      return updater.createTaskDefinition(newTaskDefinition, next);
    },
    (taskDefinition, next) => updater.updateService(options, taskDefinition.taskDefinitionArn, (err, service) => {
      return next(err, taskDefinition.taskDefinitionArn);
    })
  ], cb);
}

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

    var params = {
      cluster: options.clusterArn,
      services: [ options.serviceName ]
    };

    ecs.describeServices(params, (err, data) => {
      if (err) return cb(err);

      var service = _.find(data.services, (s) => s.serviceName === options.serviceName);
      if (!service) return cb(new Error(`Could not find service "${options.serviceName}"`));

      var params = { taskDefinition: service.taskDefinition };
      ecs.describeTaskDefinition(params, (err, data) => {
        if (err) return cb(err);
        return cb(null, data.taskDefinition);
      });
    });
  },

  updateTaskDefinitionImage(taskDefinition, containerName, image) {
    var newTaskDefinition = _.clone(taskDefinition);
    var containerIndex = _.findIndex(newTaskDefinition.containerDefinitions, (containerDefinition) => {
      return containerDefinition.name === containerName;
    });

    newTaskDefinition.containerDefinitions[containerIndex].image = image;

    return _.pick(newTaskDefinition, [
      'containerDefinitions',
      'family',
      'networkMode',
      'placementConstraints',
      'taskRoleArn',
      'volumes'
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
      taskDefinition: taskDefinitionArn
    };

    ecs.updateService(params, (err, data) => {
      if (err) return cb(err);
      cb(null, data.service);
    });
  },
});

module.exports = updater;
