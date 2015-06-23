/*******************************************************************************
 * Copyright (c) 2015 itemis AG (http://www.itemis.eu) and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *******************************************************************************/

define([
	"jquery",
	"xtext/MockEditorContext",
	"xtext/services/LoadResourceService",
	"xtext/services/RevertResourceService",
	"xtext/services/SaveResourceService",
	"xtext/services/UpdateService",
	"xtext/services/ContentAssistService",
	"xtext/services/ValidationService"
], function(mjQuery, EditorContext, LoadResourceService, RevertResourceService, SaveResourceService,
		UpdateService, ContentAssistService, ValidationService) {
	
	function _copy(obj) {
		var copy = {};
		for (var p in obj) {
			if (obj.hasOwnProperty(p))
				copy[p] = obj[p];
		}
		return copy;
	}
	
	function Tester(editorContext, doneCallback) {
		this._editorContext = editorContext;
		this._doneCallback = doneCallback;
		mjQuery.reset();
	}
	
	Tester.prototype = {
			
		setup: function(setupAction) {
			setupAction(this._editorContext);
			return this;
		},
		
		setText: function(text, start, end) {
			this._editorContext.setText(text, start, end);
			return this;
		},
		
		setCaretOffset: function(offset) {
			this._editorContext.setCaretOffset(offset);
			return this;
		},
		
		markClean: function(clean) {
			this._editorContext.markClean(clean);
			return this;
		},
		
		invokeService: function(service, invokeOptions) {
			var result = this._editorContext.invokeXtextService(service, invokeOptions);
			if (result !== undefined)
				this._lastResult = result;
			return this;
		},
			
		triggerModelChange: function(text, start, end) {
			this._editorContext.setText(text, start, end);
			var listeners = this._editorContext.getModelChangeListeners();
			for (var i in listeners) {
				var listener = listeners[i];
				listener(text);
			}
			return this;
		},
		
		checkResult: function(checker) {
			if (this._lastResult) {
				if (this._lastResult.done)
					this._lastResult.done(checker);
				else
					checker(this._lastResult);
			} else
				checker(this._editorContext);
			return this;
		},
		
		checkRequest: function(checker) {
			var request = mjQuery.getNextRequest();
			if (request) {
				checker(request.url, request.settings);
			}
			return this;
		},
		
		respond: function(result) {
			mjQuery.respond(result);
			return this;
		},
		
		httpError: function(errorThrown, xhr) {
			mjQuery.httpError(errorThrown, xhr);
			return this;
		},
		
		done: function() {
			this._doneCallback();
		}
	
	}
	
	var exports = {};
	
	exports.testEditor = function(options) {
		if (!options)
			options = {};
		var editorContext = exports.createEditor(options);
		return new Tester(editorContext, options.doneCallback);
	}
	
	exports.createEditor = function(options) {
		if (!options)
			options = {};
		var editorContext = new EditorContext();
		exports.configureServices(editorContext, options);
		return editorContext;
	}
	
	exports.configureServices = function(editorContext, options) {
		if (!options.xtextLang && options.resourceId)
			options.xtextLang = options.resourceId.split('.').pop();
		
		editorContext.getOptions = function() {
			return options;
		};
		
		//---- Persistence Services
		
		if (!options.serverUrl)
			options.serverUrl = "test://xtext-service";
		var loadResourceService, saveResourceService, revertResourceService;
		if (options.resourceId) {
			if (options.loadFromServer === undefined || options.loadFromServer) {
				options.loadFromServer = true;
				loadResourceService = new LoadResourceService(options.serverUrl, options.resourceId);
				loadResourceService.loadResource(editorContext, options);
				saveResourceService = new SaveResourceService(options.serverUrl, options.resourceId);
				revertResourceService = new RevertResourceService(options.serverUrl, options.resourceId);
			}
		} else {
			if (options.loadFromServer === undefined)
				options.loadFromServer = false;
			if (options.xtextLang)
				options.resourceId = "text." + options.xtextLang;
		}
		
		//---- Validation Service
		
		var validationService;
		if (options.enableValidationService || options.enableValidationService === undefined) {
			validationService = new ValidationService(options.serverUrl, options.resourceId);
		}
		
		//---- Update Service
		
		function refreshDocument() {
			editorContext.clearClientServiceState();
			if (validationService)
				validationService.computeProblems(editorContext, options);
		}
		var updateService;
		if (!options.sendFullText) {
			updateService = new UpdateService(options.serverUrl, options.resourceId);
			if (saveResourceService)
				saveResourceService.setUpdateService(updateService);
			editorContext.addServerStateListener(refreshDocument);
		}
		editorContext.addModelChangeListener(function(event) {
			if (options.sendFullText)
				refreshDocument();
			else
				updateService.update(editorContext, options);
		});
		
		//---- Content Assist Service
		
		var contentAssistService;
		if (options.enableContentAssistService || options.enableContentAssistService === undefined) {
			contentAssistService = new ContentAssistService(options.serverUrl, options.resourceId);
			if (updateService)
				contentAssistService.setUpdateService(updateService);
		}
		
		editorContext.invokeXtextService = function(service, invokeOptions) {
			var optionsCopy = _copy(options);
			for (var p in invokeOptions) {
				if (invokeOptions.hasOwnProperty(p)) {
					optionsCopy[p] = invokeOptions[p];
				}
			}
			if (service === "load" && loadResourceService)
				loadResourceService.loadResource(editorContext, optionsCopy);
			else if (service === "save" && saveResourceService)
				saveResourceService.saveResource(editorContext, optionsCopy);
			else if (service === "revert" && revertResourceService)
				revertResourceService.revertResource(editorContext, optionsCopy);
			else if (service === "validation" && validationService)
				validationService.computeProblems(editorContext, optionsCopy);
			else if (service === "content-assist" && contentAssistService) {
				optionsCopy.offset = editorContext.getCaretOffset();
				optionsCopy.selection = editorContext.getSelection();
				return contentAssistService.computeContentAssist(editorContext, optionsCopy);
			} else
				throw new Error("Service '" + service + "' is not available.");
		};
		editorContext.xtextServiceSuccessListeners = [];
		editorContext.xtextServiceErrorListeners = [];
	}
	
	return exports;
});
