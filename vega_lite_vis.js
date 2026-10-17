// Fit the complete drawing, including axes, legends and annotations, to its column.
function embedChart(selector, source, options) {
    return vegaEmbed(selector, source, options).then(function(result) {
        if (selector === "#treemap_chart" || selector === "#treemap_detail_chart" || selector === "#sankey_chart") {
            const container = document.querySelector(selector);
            let previousWidth;
            function resizeTreemap() {
                const availableWidth = Math.floor(container.getBoundingClientRect().width);
                if (!availableWidth || availableWidth === previousWidth) return;
                previousWidth = availableWidth;
                // Reserve the embed action button and the drawing's padding.
                const minimumWidth = selector === "#sankey_chart" ? 820 : 1;
                result.view.width(Math.max(minimumWidth, availableWidth - 48)).resize().runAsync().catch(console.error);
            }
            resizeTreemap();
            const resizeObserver = new ResizeObserver(resizeTreemap);
            resizeObserver.observe(container);
        }
        const svg = document.querySelector(selector + " svg.marks");
        if (svg) {
            function updateViewBox() {
                svg.setAttribute("viewBox", "0 0 " + svg.getAttribute("width") + " " + svg.getAttribute("height"));
            }
            updateViewBox();
            const observer = new MutationObserver(updateViewBox);
            observer.observe(svg, { attributes: true, attributeFilter: ["width", "height"] });
        }
        return result;
    });
}

// Match related marks across layers while leaving axes and basemaps alone.
const hoverHighlightGroups = {
    "#waffle_chart": { fields: ["land_type"], legend: true },
    "#landuse_bar_chart": { fields: ["activity"] },
    "#slope_chart": { fields: ["activity"] },
    "#choropleth_chart": { fields: ["properties.STE_NAME21", "state"], any: true, overlay: true },
    "#binmap_chart": { fields: ["properties.cell_id"], resetOn: ["landuse"], overlay: true },
    "#cell_landuse_chart": { fields: ["landuse"] },
    "#heatmap_chart": { fields: ["state", "activity"] },
    "#crop_symbol_map": { fields: ["state_code"], resetOn: ["cropChoice"] },
    "#crop_bump_chart": { fields: ["crop"], legend: true },
    "#crop_value_scatter": { fields: ["state_code"], legend: true, resetOn: ["cropChoice"] },
    "#horticulture_trend_chart": { fields: ["category"], legend: true }
};

// Reading annotations sit above the hover layers and never capture pointer events.
function addInsightAnnotations(spec, selector) {
    function note(name, text, x, y) {
        spec.marks.push({
            name: name, type: "text", interactive: false,
            encode: { update: {
                x: { signal: x }, y: { signal: y }, text: { value: text },
                lineBreak: { value: "\n" }, lineHeight: { value: 18 },
                font: { value: "DM Sans" }, fontSize: { value: 13 },
                align: { value: "left" }, baseline: { value: "top" },
                fill: { value: "#464C43" }
            } }
        });
    }
    function leader(name, data, x, y, x2, y2) {
        spec.marks.push({
            name: name, type: "rule", interactive: false, from: { data: data },
            encode: { update: {
                x: { signal: x }, y: { signal: y },
                x2: { signal: x2 }, y2: { signal: y2 },
                stroke: { value: "#687064" }, strokeWidth: { value: 1 },
                strokeOpacity: { value: 0.8 }
            } }
        });
    }
    function anchors(name, data, x, y) {
        spec.marks.push({
            name: name, type: "symbol", interactive: false, from: { data: data },
            encode: { update: {
                x: { signal: x }, y: { signal: y }, size: { value: 180 },
                fill: { value: "transparent" }, stroke: { value: "#464C43" },
                strokeWidth: { value: 1.3 }
            } }
        });
    }
    const finalYearX = "scale('x', datum.year) + bandwidth('x') / 2";
    if (selector === "#slope_chart") {
        spec.data.push({ name: "slopeInsight", values: [
            { year: "2020-21", index: 134.951 },
            { year: "2020-21", index: 132.368 }
        ] });
        leader("slopeInsightLeaders", "slopeInsight", "width * 0.66", "height * 0.15",
            finalYearX, "scale('y', datum.index)");
        anchors("slopeInsightAnchors", "slopeInsight", finalYearX, "scale('y', datum.index)");
        note("slopeInsightNote",
            "Intensive agriculture grew fastest (+35%),\nbut cropping gained the most land:\n10.4 million hectares.",
            "width * 0.40", "height * 0.02");
    }
    if (selector === "#choropleth_chart") {
        spec.data.push({ name: "stateShareInsight", values: [
            { longitude: 145, latitude: -21, startOffset: 0 },
            { longitude: 149, latitude: -31, startOffset: 10 }
        ], transform: [{ type: "geopoint", projection: spec.projections[0].name,
            fields: ["longitude", "latitude"], as: ["x", "y"] }] });
        spec.marks.push({
            name: "stateShareLeaders", type: "path", interactive: false,
            from: { data: "stateShareInsight" },
            encode: { update: {
                path: { signal: "'M' + (width * 0.82 + datum.startOffset) + ',' + (height * 0.145) + ' L' + datum.x + ',' + datum.y" },
                fill: { value: null }, stroke: { value: "#687064" },
                strokeWidth: { value: 1 }, strokeOpacity: { value: 0.8 },
                strokeCap: { value: "round" }
            } }
        });
        note("stateShareNote",
            "Queensland and\nNew South Wales each\nclassify over three-quarters\nof their land as agricultural-use.",
            "width * 0.78", "height * 0.02");
    }
    if (selector === "#crop_bump_chart") {
        spec.data.push({ name: "chickpeaInsight", values: [{ year: "2024-25", rank: 4 }] });
        leader("chickpeaInsightLeader", "chickpeaInsight",
            "scale('x', '2024-25') + bandwidth('x') / 2 - 30", "scale('y', 4) - 15",
            finalYearX, "scale('y', datum.rank)");
        anchors("chickpeaInsightAnchor", "chickpeaInsight", finalYearX, "scale('y', datum.rank)");
        note("chickpeaInsightNote", "Chickpeas rose from 6th to 4th.\nPlanted area more than tripled.",
            "max(4, scale('x', '2024-25') + bandwidth('x') / 2 - 230)", "scale('y', 4) - 43");
    }
    return spec;
}

function embedWithHover(selector, source, options) {
    const group = hoverHighlightGroups[selector];
    const previousPatch = options.patch;
    const accessors = group.fields.map(function(field) {
        const parts = field.split(".");
        return parts.map(function(part, index) {
            return "datum" + parts.slice(0, index + 1).map(function(key) {
                return "[" + JSON.stringify(key) + "]";
            }).join("");
        }).join(" && ");
    });
    const values = accessors.map(function(accessor) { return "(" + accessor + ")"; });
    const keyExpression = group.any
        ? values.reduceRight(function(fallback, value) {
            return "isValid(" + value + ") ? toString(" + value + ") : (" + fallback + ")";
        }, "null")
        : "(" + values.map(function(value) { return "isValid(" + value + ")"; }).join(" && ") +
          ") ? " + values.map(function(value) { return "toString(" + value + ")"; }).join(" + ' | ' + ") + " : null";
    const faded = "hoverKey != null && (" + keyExpression + ") != null && (" + keyExpression + ") !== hoverKey";

    function addFadeRule(original, replacement) {
        return [{ test: faded, value: replacement }].concat(Array.isArray(original) ? original : [original]);
    }

    function patchMarks(marks) {
        (marks || []).forEach(function(mark) {
            if (mark.marks) {
                patchMarks(mark.marks);
            }
            if (!/(^marks$|_marks$)/.test(mark.name || "") || mark.type === "group") {
                return;
            }
            const update = mark.encode.update || (mark.encode.update = {});
            const enter = mark.encode.enter || {};
            const paint = mark.type === "line" || mark.type === "rule" ? "stroke" : "fill";
            const originalPaint = update[paint] || enter[paint];
            // Preserve transparent outlines, including the selected bin-map cell.
            if (originalPaint && originalPaint.value !== null) {
                update[paint] = addFadeRule(originalPaint, mark.type === "text" ? "#9DA39A" : "#D1D5CE");
            }
            update.opacity = addFadeRule(update.opacity || enter.opacity || { value: 1 }, 0.45);
        });
    }

    function patchMapOverlay(spec) {
        const highlights = [];
        spec.marks.forEach(function(mark, index) {
            if (!mark.from || !mark.from.data) {
                return;
            }
            // Keep the persistent bin-cell outline above the hover veil.
            if (selector === "#binmap_chart" && mark.name === "layer_2_marks") {
                highlights.push(mark);
                return;
            }
            const name = "hover_focus_" + index;
            spec.data.push({
                name: name,
                source: mark.from.data,
                transform: [{ type: "filter", expr: "hoverKey != null && (" + keyExpression + ") === hoverKey" }]
            });
            const highlight = JSON.parse(JSON.stringify(mark));
            highlight.name = name + "_marks";
            highlight.from = { data: name };
            // Hover and tooltips still come from the original map underneath.
            highlight.interactive = false;
            highlights.push(highlight);
        });
        spec.marks = spec.marks.filter(function(mark) {
            return !(selector === "#binmap_chart" && mark.name === "layer_2_marks");
        });
        spec.marks.push({
            name: "hover_map_veil",
            type: "rect",
            interactive: false,
            encode: {
                update: {
                    x: { value: 0 }, y: { value: 0 },
                    width: { signal: "width" }, height: { signal: "height" },
                    fill: { value: "#E5E7E2" },
                    opacity: { signal: "hoverKey == null ? 0 : 0.85" }
                }
            }
        });
        spec.marks.push.apply(spec.marks, highlights);
    }

    return embedChart(selector, source, Object.assign({}, options, {
        // SVG retains the thousands of base-map paths between hover updates.
        renderer: group.overlay ? "svg" : (options.renderer || "canvas"),
        patch: function(spec) {
            if (previousPatch) {
                spec = previousPatch(spec);
            }
            if (selector === "#binmap_chart" || selector === "#choropleth_chart" || selector === "#crop_symbol_map") {
                (spec.projections || []).forEach(function(projection) {
                    delete projection.size;
                    projection.extent = { signal: "[[24, 0], [width + 24, height]]" };
                });
            }
            if (selector === "#choropleth_chart" || selector === "#binmap_chart" || selector === "#crop_symbol_map") {
                (spec.legends || []).forEach(function(legend) {
                    legend.orient = "none";
                    legend.legendX = 0;
                    legend.legendY = { signal: "height * 0.88" };
                });
            }
            spec.signals = spec.signals || [];
            spec.signals.push({ name: "hoverKey", value: null });
            if (group.overlay) {
                patchMapOverlay(spec);
            } else {
                patchMarks(spec.marks);
            }
            addInsightAnnotations(spec, selector);
            return spec;
        }
    })).then(function(result) {
        const view = result.view;
        let activeKey = null;
        let requestedKey = null;
        let framePending = false;
        let runPending = false;

        function scheduleHighlight(key) {
            requestedKey = key;
            if (framePending) {
                return;
            }
            framePending = true;
            requestAnimationFrame(function() {
                framePending = false;
                if (!runPending && activeKey !== requestedKey) {
                    activeKey = requestedKey;
                    runPending = true;
                    view.signal("hoverKey", activeKey).runAsync().catch(console.error).finally(function() {
                        runPending = false;
                        if (activeKey !== requestedKey) {
                            scheduleHighlight(requestedKey);
                        }
                    });
                }
            });
        }

        function getKey(item) {
            const datum = item && item.datum;
            if (!datum) {
                return null;
            }
            const fields = group.fields.map(function(field) {
                return field.split(".").reduce(function(value, key) {
                    return value == null ? undefined : value[key];
                }, datum);
            });
            if (group.any) {
                const value = fields.find(function(value) { return value != null; });
                return value == null ? null : String(value);
            }
            if (fields.every(function(value) { return value != null; })) {
                return fields.map(String).join(" | ");
            }
            if (group.legend && item.mark && /legend/.test(item.mark.role || "") && datum.value != null) {
                return String(datum.value);
            }
            return null;
        }

        view.addEventListener("mousemove", function(event, item) {
            scheduleHighlight(getKey(item));
        });
        view.addEventListener("mouseout", function() {
            scheduleHighlight(null);
        });
        (group.resetOn || []).forEach(function(signal) {
            view.addSignalListener(signal, function() { scheduleHighlight(null); });
        });
        return result;
    });
}

embedWithHover(
    "#waffle_chart",
    "js/chart1_waffle.vg.json",
    {
        actions: true
    }
).catch(console.error);


embedChart(
    "#treemap_chart",
    "js/chart2_treemap.vg.json",
    {
        actions: true
    }
).catch(console.error);

// Create the detail chart only when visible, so it has a measurable width.
const treemapDetailPanel = document.getElementById("treemap-detail-panel");
let treemapDetailStarted = false;
treemapDetailPanel.addEventListener("toggle", function() {
    if (!this.open || treemapDetailStarted) return;
    treemapDetailStarted = true;
    embedChart("#treemap_detail_chart", "js/chart2_treemap_detail.vg.json", { actions: false })
        .catch(function(error) {
            treemapDetailStarted = false;
            console.error(error);
        });
});


embedWithHover(
    "#landuse_bar_chart",
    "js/chart3_landuse_bar.vg.json",
    {
        actions: true
    }
).catch(console.error);

embedWithHover(
    "#slope_chart",
    "js/chart4_slope.vg.json",
    {
        actions: true
    }
).catch(console.error);

embedChart(
    "#sankey_chart",
    "js/chart5_sankey.vg.json",
    {
        actions: true
    }
).then(function(result) {

    const view = result.view;


    const stat =
        document.getElementById("sankey_big_stat");

    const text =
        document.getElementById("sankey_callout_text");


    function resetCallout() {

        stat.textContent =
            "10.4 M ha";

        text.textContent =
            "was the net shift from grazing-related land uses towards cropping between 2010-11 and 2020-21.";
    }


    function updateCallout(datum) {

        if (!datum) {
            resetCallout();
            return;
        }



        stat.textContent =
            Number(datum.area_million_ha).toFixed(2) +
            " M ha";


        text.innerHTML =
            "was the net shift from <strong>" +
            datum.source +
            "</strong> towards <strong>" +
            datum.target +
            "</strong> between 2010-11 and 2020-21.";
    }


    view.addSignalListener(
        "activeDatum",
        function(name, value) {

            updateCallout(value);

        }
    );


    resetCallout();

}).catch(console.error);

embedWithHover(
    "#choropleth_chart",
    "js/chart6_choropleth.vg.json",
    {
        actions: true
    }
).catch(console.error);

Promise.all([
    embedWithHover(
        "#binmap_chart",
        "js/chart7_binmap.vg.json",
        { actions: true }
    ),
    embedWithHover(
        "#cell_landuse_chart",
        "js/chart7_cell_detail.vg.json",
        { actions: true }
    )
]).then(function(results) {

    const view = results[0].view;
    const detailView = results[1].view;
    const selector = document.getElementById("landuse_select");
    const status = document.getElementById("cell_selection_status");
    const detail = document.getElementById("cell_comparison_detail");
    const clearButton = document.getElementById("clear_cell_selection");

    view.addEventListener("click", function(event, item) {
        const properties = item && item.datum && item.datum.properties;

        // Ignore the map background and state boundary layer.
        if (!properties || !properties.cell_id) {
            return;
        }

        const rows = [
            { landuse: "Grazing", share: properties.grazing_pct },
            { landuse: "Cropping", share: properties.cropping_pct },
            { landuse: "Horticulture", share: properties.horticulture_pct }
        ];

        detailView.change(
            "cellLanduse",
            vega.changeset().remove(function() { return true; }).insert(rows)
        ).runAsync().catch(console.error);

        view.signal("selectedCellId", properties.cell_id).runAsync().catch(console.error);
        detail.hidden = false;
        clearButton.disabled = false;
        status.textContent = "Selected cell " + properties.cell_id + ". Click another cell to compare.";
    });

    clearButton.addEventListener("click", function() {
        view.signal("selectedCellId", null).runAsync().catch(console.error);
        detailView.change(
            "cellLanduse",
            vega.changeset().remove(function() { return true; })
        ).runAsync().catch(console.error);
        detail.hidden = true;
        clearButton.disabled = true;
        status.textContent = "Click a cell to compare land uses.";
        // Keep keyboard focus on a visible control after hiding the button.
        selector.focus();
    });

    selector.addEventListener("change", function() {
        view.signal("landuse", this.value).runAsync().catch(console.error);
    });

}).catch(console.error);

embedWithHover(
    "#heatmap_chart",
    "js/chart8_heatmap.vg.json",
    {
        actions: true,
        patch: function(spec) {
            spec.data.push({
                name: "heatmap_annotation_targets",
                values: [
                    { activity: "Horticulture" },
                    { activity: "Intensive agriculture" }
                ]
            });
            // Align the legend with the left state-label edge, beside the annotation.
            spec.legends.forEach(function(legend) {
                legend.orient = "none";
                legend.legendX = -150;
                legend.legendY = { signal: "height + 70" };
            });
            spec.marks.push(
                {
                    name: "heatmapAnnotationLeaders",
                    type: "rule",
                    interactive: false,
                    from: { data: "heatmap_annotation_targets" },
                    encode: {
                        update: {
                            x: { signal: "width * (datum.activity === 'Horticulture' ? 0.60 : 0.70)" },
                            y: { signal: "height + 60" },
                            x2: { signal: "scale('x', datum.activity) + bandwidth('x') / 2" },
                            y2: { signal: "height + 24" },
                            stroke: { value: "#73776D" },
                            strokeWidth: { value: 1.2 }
                        }
                    }
                },
                {
                    name: "heatmapAnnotationText",
                    type: "text",
                    interactive: false,
                    encode: {
                        update: {
                            x: { signal: "width * 0.48" },
                            y: { signal: "height + 70" },
                            text: { value: "Intensive agriculture is present in several states,\nbut its share is so small relative to grazing and\ncropping that it rounds to 0%." },
                            lineBreak: { value: "\n" },
                            lineHeight: { value: 18 },
                            font: { value: "DM Sans" },
                            fontSize: { value: 13 },
                            fontWeight: { value: 400 },
                            align: { value: "left" },
                            baseline: { value: "top" },
                            fill: { value: "#464C43" }
                        }
                    }
                }
            );
            return spec;
        }
    }
).catch(console.error);

embedWithHover(
    "#crop_symbol_map",
    "js/chart9_crop_symbol_map.vg.json",
    { actions: true }
).then(function(result) {
    const selector = document.getElementById("crop_map_select");
    selector.addEventListener("change", function() {
        result.view.signal("cropChoice", this.value).runAsync().catch(console.error);
    });
}).catch(console.error);

embedWithHover(
    "#crop_bump_chart",
    "js/chart_bump_crop_rank.vg.json",
    { actions: true }
).catch(console.error);

// Chart 11 temporarily disabled; uncomment this block to restore.
// embedWithHover(
//     "#crop_value_scatter",
//     "js/chart10_crop_area_value.vg.json",
//     {
//         actions: true
//     }
// ).then(function(result) {
// 
//     const view = result.view;
//     const selector = document.getElementById("scatter_crop_select");
// 
//     selector.addEventListener("change", function() {
// 
//         view
//             .signal("cropChoice", this.value)
//             .run();
// 
//     });
// 
// }).catch(console.error);

embedWithHover(
    "#horticulture_trend_chart",
    "js/chart11_horticulture_trend.vg.json",
    {
        actions: true,
        patch: function(spec) {
            // Keep the turning point attached to its data coordinates on resize.
            spec.data.push({
                name: "nutTurningPoint",
                values: [{ year: "2022-23", value: 742.7 }]
            });
            spec.marks.push(
                {
                    name: "nutRecoveryLeader", type: "rule", interactive: false,
                    from: { data: "nutTurningPoint" },
                    encode: { update: {
                        x: { signal: "scale('x', datum.year) + bandwidth('x') / 2 - 35" },
                        y: { signal: "scale('y', datum.value) - 28" },
                        x2: { signal: "scale('x', datum.year) + bandwidth('x') / 2" },
                        y2: { signal: "scale('y', datum.value)" },
                        stroke: { value: "#687064" }, strokeWidth: { value: 1.2 }
                    } }
                },
                {
                    name: "nutRecoveryAnchor", type: "symbol", interactive: false,
                    from: { data: "nutTurningPoint" },
                    encode: { update: {
                        x: { signal: "scale('x', datum.year) + bandwidth('x') / 2" },
                        y: { signal: "scale('y', datum.value)" },
                        size: { value: 140 }, fill: { value: "transparent" },
                        stroke: { value: "#A15B13" }, strokeWidth: { value: 2 }
                    } }
                },
                {
                    name: "nutRecoveryNote", type: "text", interactive: false,
                    from: { data: "nutTurningPoint" },
                    encode: { update: {
                        x: { signal: "max(4, scale('x', datum.year) + bandwidth('x') / 2 - 210)" },
                        y: { signal: "scale('y', datum.value) - 78" },
                        text: { value: "Nuts fell to $0.74B in 2022-23,\nthen recovered to $1.66B by 2024-25." },
                        lineBreak: { value: "\n" }, lineHeight: { value: 18 },
                        font: { value: "DM Sans" }, fontSize: { value: 12 },
                        align: { value: "left" }, baseline: { value: "top" },
                        fill: { value: "#464C43" }
                    } }
                }
            );
            return spec;
        }
    }
).catch(console.error);

