/* @preserve
 * The MIT License (MIT)
 * 
 * Copyright (c) 2016 William Ma
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * 
 */
define(["jquery", "text!./dynamictablesparkline.css", "qlik", "./bluebird.min", "./jquery.sparkline.min"], function($, cssContent, qlik, Promise) {
    'use strict';
    $("<style>").html(cssContent).appendTo("head");


    function getHyperCube(qlik, qDims, sparkDim, qMeasure, sparkMeasure, dimsForSetAnalysis) {
        var app = qlik.currApp();

        var sDim = [{
            qDef: {
                qFieldDefs: [sparkDim],
                qSortCriterias: [{ qSortByAscii: 1 }]
            }
        }];
        // Don't need to build dimensions in hypercube, using set analysis
        //var hyperCubeDims = _.concat(qDims, sDim);

        // Build Set Analysis
        var setAnalysis = "{$<";
        $.each(dimsForSetAnalysis, function(key, value) {
            setAnalysis += '[' + value.dim + ']={[' + value.dimValue + ']}';
            if (key < dimsForSetAnalysis.length - 1)
                setAnalysis += ', ';
        });
        setAnalysis += ">}";

        var sparkMeasureWithSet = sparkMeasure.replace("$(SET)", setAnalysis);

        return app.createCube({
            qDimensions: sDim,
            qMeasures: [{
                qDef: {
                    qDef: sparkMeasureWithSet
                }
            }],
            qInitialDataFetch: [{
                qTop: 0,
                qLeft: 0,
                qHeight: 100,
                qWidth: 20
            }]
        }).then(function(reply) {
            return reply.getLayout().then(function(layout) {
                var str = [];
                $.each(layout.qHyperCube.qDataPages[0].qMatrix, function(key, value) {
                    str.push(value[1].qText);
                    //if (key < layout.qHyperCube.qDataPages[0].qMatrix.length - 1)
                    //    str += ",";
                });
                return str;
            });
        });

    }

    function buildQDimensions(vizDims) {

        return vizDims.map(function(dim) {
            if (!(dim.qLibraryId === undefined)) {
                return {
                    qLibraryId: dim.qLibraryId
                }
            } else {
                return {
                    qDef: {
                        qFieldDefs: [dim.qFallbackTitle]
                    }
                }
            }
        })
    }

    function getVisualizationDims(qlik, view) {

        var app = qlik.currApp();
        var hyperCubDimDefs = view.backendApi.getProperties().then(function(defs) {
            return defs.qHyperCubeDef.qDimensions.map(function(def) {
                return {
                    qLibraryId: def.qLibraryId,
                    qFallbackTitle: def.qFallbackTitle
                }
            });
        });
        var hyperCubDims = view.backendApi.getDimensionInfos();
        
        return Promise.all([hyperCubDimDefs, hyperCubDims]).spread(function(defs, dims) {
            var vizDims = [];

            for (var i = 0; i < dims.length; i++) {
                vizDims.push({
                    qLibraryId: defs[i].qLibraryId,
                    qFallbackTitle: dims[i].qFallbackTitle
                });
            }
            return vizDims;

        });
    }

    function getDims(qlik) {


        var app = qlik.currApp();



        /*  -------- Getting fields with for each ------
        var dims = [];
        app.getList("FieldList", function(reply) {
            var test=[];
            //jQuery.each(reply.qFieldList.qItems, function(key, value) {
            reply.qFieldList.qItems.forEach(function(key, value) {
                
                var opt = {
                    value: key.qName.toLowerCase(),
                    label: key.qName
                };
                test.push(opt);
            });
            dims = test;
            console.log(dims);
        });
        return dims;
        -------- Getting fields with for each ------ */

        /*  -------- Getting fields with bluebird ------
        var a = app.getList("FieldList");
        var b = a.then(function(reply) {
            return reply.getLayout();
        });

        return Promise.all([a, b]).spread(function(reply, layout) {
            return layout.qFieldList.qItems.map(function(dim) {
                return dim.qName;
            });

        });
        -------- Getting fields with bluebird ------*/

        return app.getList("FieldList").then(function(reply) {

            return reply.getLayout().then(function(layout) {
                return layout.qFieldList.qItems.map(function(dim) {
                    return {
                        value: dim.qName,
                        label: dim.qName
                    }
                }).sort(function compare(a, b) {
                    if (a.value < b.value) {
                        return -1;
                    }
                    if (a.value > b.value) {
                        return 1;
                    }
                    // a must be equal to b
                    return 0;
                });

            });


        });



    }

    /**
     * Set column to be first in sort order
     * @param self The extension
     * @param col Column number, starting with 0
     */
    function setSortOrder(self, col) {
        //set this column first
        var sortorder = [col];
        //append the other columns in the same order
        self.backendApi.model.layout.qHyperCube.qEffectiveInterColumnSortOrder.forEach(function(val) {
            if (val !== sortorder[0]) {
                sortorder.push(val);
            }
        });
        self.backendApi.applyPatches([{
            'qPath': '/qHyperCubeDef/qInterColumnSortOrder',
            'qOp': 'replace',
            'qValue': '[' + sortorder.join(',') + ']'
        }], true);
    }

    /**
     * Reverse sort order for column
     * @param self The extension
     * @param col The column number, starting with 0
     */
    function reverseOrder(self, col) {
        var hypercube = self.backendApi.model.layout.qHyperCube;
        var dimcnt = hypercube.qDimensionInfo.length;
        var reversesort = col < dimcnt ? hypercube.qDimensionInfo[col].qReverseSort :
            hypercube.qMeasureInfo[col - dimcnt].qReverseSort;
        self.backendApi.applyPatches([{
            'qPath': '/qHyperCubeDef/' +
                (col < dimcnt ? 'qDimensions/' + col : 'qMeasures/' + (col - dimcnt)) +
                '/qDef/qReverseSort',
            'qOp': 'replace',
            'qValue': (!reversesort).toString()
        }], true);
    }

    function formatHeader(col, value, sortorder) {
        var html =
            '<th data-col="' + col + '">' + value.qFallbackTitle;
        //sort Ascending or Descending ?? add arrow
        if (value.qSortIndicator === 'A' || value.qSortIndicator === 'D') {
            html += (value.qSortIndicator === 'A' ? "<i class='icon-triangle-top" : "<i class='icon-triangle-bottom");
            if (sortorder && sortorder[0] !== col) {
                html += " secondary";
            }
            html += "'></i>";
        }
        html += "</th>";
        return html;
    }

    return {
        initialProperties: {
            version: 1.0,
            qHyperCubeDef: {
                qDimensions: [],
                qMeasures: [],
                qInitialDataFetch: [{
                    qWidth: 20,
                    qHeight: 50
                }]
            }
        },
        definition: {
            type: "items",
            component: "accordion",
            items: {
                dimensions: {
                    uses: "dimensions",
                    min: 1
                },
                measures: {
                    uses: "measures",
                    min: 0,
                    items: {
                        sparkline: {
                            ref: "props.sparkline",
                            label: "Sparkline",
                            type: "boolean",
                            defaultValue: false
                        },
                        sparklineType: {
                            type: "string",
                            component: "dropdown",
                            label: "Sparkline Type",
                            ref: "props.sparklineType",
                            options: [{
                                value: "line",
                                label: "Line"
                            }, {
                                value: "bar",
                                label: "Bar"
                            }, {
                                value: "tristate",
                                label: "Tristate"
                            }, {
                                value: "discrete",
                                label: "Discrete"
                            }, {
                                value: "bullet",
                                label: "Bullet"
                            }, {
                                value: "pie",
                                label: "Pie"
                            }, {
                                value: "box",
                                label: "Box Plot"
                            }],
                            defaultValue: "Line"
                        },
                        sparklineDimension: {
                            type: "string",
                            component: "dropdown",
                            label: "Sparkline Dimension",
                            ref: "props.sparklineDimension",
                            options: getDims(qlik)
                        },
                        sparklineMeasure: {
                            type: "string",
                            label: "Sparkline Measure ($(SET))",
                            ref: "props.sparklineMeasure"
                        }

                    }
                },
                sorting: {
                    uses: "sorting"
                },
                settings: {
                    uses: "settings",
                    items: {
                        initFetchRows: {
                            ref: "qHyperCubeDef.qInitialDataFetch.0.qHeight",
                            label: "Initial fetch rows",
                            type: "number",
                            defaultValue: 50
                        }
                    }
                }
            }
        },
        snapshot: {
            canTakeSnapshot: true
        },

        paint: function($element, layout) {

            var self = this;
            this.backendApi.getProperties().then(function(visualProperties) {
                var dimsForSetAnalysis = [];



                var html = "<table><thead><tr>",
                    //self = this,
                    lastrow = 0,
                    morebutton = false,
                    dimcount = self.backendApi.getDimensionInfos().length,
                    sortorder = self.backendApi.model.layout.qHyperCube.qEffectiveInterColumnSortOrder;
                //render titles
                var numOfDims = self.backendApi.getDimensionInfos().length;

                self.backendApi.getDimensionInfos().forEach(function(value, col) {
                    html += formatHeader(col, value, sortorder);

                    // set dims for set analysis
                    dimsForSetAnalysis.push(value.qFallbackTitle);
                });

                self.backendApi.getMeasureInfos().forEach(function(value, col) {
                    html += formatHeader(col + dimcount, value, sortorder);
                });
                html += "</tr></thead><tbody>";

                //$element.append(html);
                //render data
                self.backendApi.eachDataRow(function(rownum, row) {


                    lastrow = rownum;
                    html += '<tr>';
                    var dimValuesForSetAnalysis = [];
                    row.forEach(function(cell, col) {

                        if (cell.qIsOtherCell) {

                            cell.qText = self.backendApi.getDimensionInfos()[col].othersLabel;
                        }
                        html += "<td class='";
                        if (!isNaN(cell.qNum)) {
                            html += "numeric ";
                        }
                        //negative elementnumbers are not selectable
                        if (col < dimcount && cell.qElemNumber > -1) {
                            html += "selectable' data-value='" + cell.qElemNumber + "' data-dimension='" + col + "'";
                        } else {
                            html += "'";
                        }

                        if (col < numOfDims) {
                            html += '>' + cell.qText + '</td>';
                            dimValuesForSetAnalysis.push(cell.qText);
                        } else {
                            var index = col - numOfDims;
                            if (!visualProperties.qHyperCubeDef.qMeasures[index].props.sparkline)
                                html += '>' + cell.qText + '</td>';
                            else {
                                var dimSetAnalysis = [];
                                for (var i = 0; i < dimsForSetAnalysis.length; i++) {
                                    dimSetAnalysis.push({
                                        dim: dimsForSetAnalysis[i],
                                        dimValue: dimValuesForSetAnalysis[i]
                                    })
                                }


                                html += '><span id="dynamicsparkline-' + rownum + '-' + col +'" class="dynamicsparkline">Loading . . .</span></td>';
                                var bla = getVisualizationDims(qlik, self).then(function(vizDims) {
                                    var qDims = buildQDimensions(vizDims);
                                    var measure = visualProperties.qHyperCubeDef.qMeasures[index];


                                    getHyperCube(qlik, qDims, measure.props.sparklineDimension, measure.qDef.qDef, measure.props.sparklineMeasure, dimSetAnalysis).then(function(hCube) {
                                        $element.find('#dynamicsparkline-' + rownum + '-' + col).sparkline(hCube, {type: measure.props.sparklineType});
                                    });

                                });

                            }
                        }
                    });
                    html += '</tr>';

                });
                html += "</tbody></table>";

                //add 'more...' button

                if (self.backendApi.getRowCount() > lastrow + 1) {
                    html += "<button id='more'>More...</button>";
                    morebutton = true;
                }

                $element.html(html);

                //$element.find('.inlinesparkline').sparkline('html', { type: 'line' });
                if (morebutton) {
                    var requestPage = [{
                        qTop: lastrow + 1,
                        qLeft: 0,
                        qWidth: 20, //should be # of columns
                        qHeight: Math.min(50, self.backendApi.getRowCount() - lastrow)
                    }];
                    $element.find("#more").on("qv-activate", function() {
                        self.backendApi.getData(requestPage).then(function(dataPages) {
                            self.paint($element);
                        });
                    });
                }
                $element.find('.selectable').on('qv-activate', function() {
                    if (this.hasAttribute("data-value")) {
                        var value = parseInt(this.getAttribute("data-value"), 10),
                            dim = parseInt(this.getAttribute("data-dimension"), 10);
                        self.selectValues(dim, [value], true);
                        $element.find("[data-dimension='" + dim + "'][data-value='" + value + "']").toggleClass("selected");
                    }
                });
                $element.find('th').on('qv-activate', function() {
                    if (this.hasAttribute("data-col")) {
                        var col = parseInt(this.getAttribute("data-col"), 10);
                        setSortOrder(self, col);
                    }
                });
                $element.find('th i').on('qv-activate', function() {
                    var parent = this.parentNode;
                    if (parent.hasAttribute("data-col")) {
                        var col = parseInt(parent.getAttribute("data-col"), 10);
                        reverseOrder(self, col);
                    }
                });
            });
        }
    };
});