// components/ArcDiagram.js (MRP v1.14 - Add Dimension Logging & Minimal Padding)
"use client";

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getNodeMetadata } from '@/utils/dataService';

// --- D3 Helper Functions ---

// setupScales with MINIMAL FIXED PADDING
function setupScales(nodes, width, height, nodeRadius) {
    const defaultScale = d3.scalePoint(); const defaultColor = d3.scaleOrdinal();
    const defaultReturn = { yScale: defaultScale, colorScale: defaultColor, axisXPosition: 0 };
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0 || !width || width <= 0 || !height || height <= 0 || !nodeRadius || nodeRadius <= 0) { return defaultReturn; }

    try {
        const validNodeIds = nodes.filter(d => d && typeof d.id === 'string' && d.id.length > 0).map(d => d.id);
        if(validNodeIds.length === 0) { return defaultReturn; }

        // Minimal Fixed Padding
        const padding = 0.1; // Small fixed value (adjust 0.05 to 0.2 if needed)

        const yScale = d3.scalePoint().domain(validNodeIds).range([0, height]).padding(padding);
        if (!yScale || typeof yScale.domain !== 'function' || yScale.domain().length !== validNodeIds.length || typeof yScale.bandwidth !== 'function') { console.error("[setupScales] yScale creation failed or invalid."); return defaultReturn; }

        const bookNames = Array.from(new Set(nodes.filter(d => d && d.book).map(d => d.book || 'Unknown')));
        const colorScheme = bookNames.length > 10 ? d3.schemeSpectral[Math.min(bookNames.length, 11)] : d3.schemeCategory10;
        const colorScale = d3.scaleOrdinal(colorScheme).domain(bookNames.length > 0 ? bookNames : ['Unknown']);
        if (typeof colorScale !== 'function' || typeof colorScale.domain !== 'function' || colorScale.domain().length === 0) { console.error("[setupScales] colorScale creation failed."); return defaultReturn; }

        const axisXPosition = 0;
        return { yScale, colorScale, axisXPosition };

    } catch (error) { console.error("[setupScales] Error:", error); return defaultReturn; }
}

function calculateArcPath(d, yScale, axisXPosition) {
    const y1 = yScale(d.source); const y2 = yScale(d.target);
    if (y1 === undefined || y2 === undefined) { return null; }
    const radius = Math.abs(y2 - y1) / 2;
    if (radius <= 0.1) return `M ${axisXPosition},${y1} L ${axisXPosition},${y2}`;
    const sweepFlag = y1 < y2 ? 1 : 0;
    return `M ${axisXPosition},${y1} A ${radius},${radius} 0 0,${sweepFlag} ${axisXPosition},${y2}`;
 }

// Centralized Arc Style Calculation Helper
function getArcStyle(link, selectedNodeId, hoveredNodeId) {
    const defaultOpacity = 0.5; const defaultWidth = 1;
    const highlightedOpacity = 0.9; const highlightedWidth = 1.5;
    const dimmedOpacity = 0.1;
    const isSelectedVerse = selectedNodeId && /[v\.]\d+$/i.test(selectedNodeId);
    const isLinkSelected = isSelectedVerse && (link.source === selectedNodeId || link.target === selectedNodeId);
    const isLinkHovered = hoveredNodeId && (link.source === hoveredNodeId || link.target === hoveredNodeId);

    if (isLinkHovered) { return { strokeWidth: highlightedWidth, strokeOpacity: highlightedOpacity }; }
    else if (hoveredNodeId) { return { strokeWidth: isLinkSelected ? highlightedWidth : defaultWidth, strokeOpacity: isLinkSelected ? highlightedOpacity : dimmedOpacity }; }
    else if (isLinkSelected) { return { strokeWidth: highlightedWidth, strokeOpacity: highlightedOpacity }; }
    else if (isSelectedVerse) { return { strokeWidth: defaultWidth, strokeOpacity: dimmedOpacity }; }
    else { return { strokeWidth: defaultWidth, strokeOpacity: defaultOpacity }; }
}

// Arc Drawing Helper
function drawAndUpdateArcs(selection, links, yScale, colorScale, axisXPosition, nodeMap, selectedNodeId) {
    const MAX_ARCS_TO_RENDER = 1000;
    const linksToDraw = links.length > MAX_ARCS_TO_RENDER ? links.slice(0, MAX_ARCS_TO_RENDER) : links;
    if (links.length > MAX_ARCS_TO_RENDER) { console.warn(`[drawAndUpdateArcs] Rendering limited to ${MAX_ARCS_TO_RENDER} arcs.`); }

    const paths = selection.selectAll("path.arc-path").data(linksToDraw, d => `${d.source}-${d.target}`);

    paths.join(
        enter => enter.append("path").attr("class", "arc-path").attr("fill", "none").attr("stroke", d => colorScale(nodeMap.get(d.source)?.book || 'Unknown')).attr("d", d => calculateArcPath(d, yScale, axisXPosition)).each(function(d) { const style = getArcStyle(d, selectedNodeId, null); d3.select(this).attr("stroke-width", style.strokeWidth).attr("stroke-opacity", 0); }).call(enter => enter.transition("fadeInArc").duration(300).style("stroke-opacity", function(d) { return getArcStyle(d, selectedNodeId, null).strokeOpacity; }) ).call(enter => enter.append("title").text(d => { const s=getNodeMetadata(d.source), t=getNodeMetadata(d.target); return `${s.label||d.source} → ${t.label||d.target}`; })),
        update => update
                     .call(update => update.transition("arcUpdatePosColor").duration(250).attr("stroke", d => colorScale(nodeMap.get(d.source)?.book || 'Unknown')).attr("d", d => calculateArcPath(d, yScale, axisXPosition)))
                     .each(function(d) { const style = getArcStyle(d, selectedNodeId, null); d3.select(this).attr("stroke-width", style.strokeWidth).attr("stroke-opacity", style.strokeOpacity); }) // Apply styles directly
                     .select("title").text(d => { const s=getNodeMetadata(d.source), t=getNodeMetadata(d.target); return `${s.label||d.source} → ${t.label||d.target}`; }),
        exit => exit.transition("fadeOutArc").duration(200).style("opacity", 0).remove()
    );
}

// Node Drawing Helper
function drawAndUpdateNodes(selection, nodes, yScale, colorScale, nodeRadius, axisXPosition, labelFontSize, labelXOffset, handlers, selectedNodeId, styles) {
     const { selectedStrokeWidth, hoverStrokeWidth, defaultStrokeWidth, selectedStrokeColor, hoverStrokeColor, selectedFillOpacity, hoverFillOpacity, defaultFillOpacity, selectedFontWeight, defaultFontWeight, transitionDuration } = styles;
     const nodeSpacing = yScale.step(); const showLabels = nodeSpacing > (labelFontSize * 1.3);
     const nodeGroups = selection.selectAll("g.node-group").data(nodes, d => d.id);
     nodeGroups.join(
         enter => { const g = enter.append("g").attr("class", "node-group").attr("cursor", "pointer").style("opacity", 0).attr("transform", d => `translate(${axisXPosition},${yScale(d.id) ?? 0})`).on("mouseover", handlers.mouseover).on("mouseout", handlers.mouseout).on("click", handlers.click); const isSel = d=>d.id===selectedNodeId; g.append("circle").attr("r", nodeRadius).attr("cx",0).attr("cy",0).attr("fill", d => colorScale(d.book||'Unknown')).style("fill-opacity", d=>isSel(d)?selectedFillOpacity:defaultFillOpacity).style("stroke", d=>isSel(d)?selectedStrokeColor:d3.rgb(colorScale(d.book || 'Unknown')).darker(0.7)).style("stroke-width", d=>isSel(d)?selectedStrokeWidth:defaultStrokeWidth); /* title removed */ g.append("text").attr("class", "node-label fill-current text-gray-700 dark:text-gray-300").style("font-size", `${labelFontSize}px`).style("font-weight", d=>isSel(d)?selectedFontWeight:defaultFontWeight).attr("x", labelXOffset).attr("dy", "0.35em").attr("text-anchor", "end").style("pointer-events","none").attr("display",showLabels?null:"none").text(d=>d.label||d.id); g.transition("fadeInNode").duration(transitionDuration).style("opacity", 1); return g; },
         update => { const isSel = d=>d.id===selectedNodeId; update.transition("updateNodePos").duration(transitionDuration).attr("transform", d=>`translate(${axisXPosition},${yScale(d.id)??0})`); update.select("circle").transition("updateCircleStyle").duration(transitionDuration).attr("r", nodeRadius).attr("fill", d => colorScale(d.book||'Unknown')).style("fill-opacity", d=>isSel(d)?selectedFillOpacity:defaultFillOpacity).style("stroke", d=>isSel(d)?selectedStrokeColor:d3.rgb(colorScale(d.book||'Unknown')).darker(0.7)).style("stroke-width", d=>isSel(d)?selectedStrokeWidth:defaultStrokeWidth); update.select("circle title").remove(); update.select("text.node-label").attr("display",showLabels?null:"none").transition("updateLabelStyle").duration(transitionDuration).style("font-size", `${labelFontSize}px`).style("font-weight", d=>isSel(d)?selectedFontWeight:defaultFontWeight).attr("x", labelXOffset).text(d=>d.label||d.id); return update; },
         exit => exit.transition("fadeOutNode").duration(transitionDuration).style("opacity", 0).remove()
     );
}


// --- Main Component ---
function ArcDiagram({
    svgRef, data, width, height, selectedNodeId, onNodeSelect,
    resetZoomTrigger,
    viewMode
}) {
  const zoomGroupRef = useRef();
  const nodeMap = useRef(new Map()).current;
  const zoomBehaviorRef = useRef();
  const localHoveredNodeId = useRef(null);

  // --- Main Effect for Drawing/Updating ---
  useEffect(() => {
    // >> ADD LOGGING for received width/height props <<
    console.log(`[ArcDiagram Effect] Received Props: Width=${width}, Height=${height}, Nodes=${data?.nodes?.length}`);

    if (!svgRef?.current || !zoomGroupRef?.current) return;
    const rootSvg = d3.select(svgRef.current);
    const zoomGroup = d3.select(zoomGroupRef.current);
    zoomGroup.selectAll("g.dynamic-hover-info").remove(); // Clear previous hover info

    if (!data || !data.nodes || data.nodes.length === 0 || !width || width <= 10 || !height || height <= 50) {
        // console.log('[ArcDiagram Effect] Aborting draw: Invalid data or dimensions.');
        zoomGroup.selectAll("*").remove(); return; // Exit effect early
    }

    // Define Parameters & Styles
    const nodeRadius = 7; const labelFontSize = 17; const labelXOffset = -(nodeRadius + 10);
    const hoverTransitionDuration = 50; const transitionDuration = 150;
    const styles = {
        selectedStrokeWidth: 2.0, hoverStrokeWidth: 2.5, defaultStrokeWidth: 0.5,
        selectedStrokeColor: 'black', hoverStrokeColor: 'rgb(29, 78, 216)',
        selectedFillOpacity: 0.9, hoverFillOpacity: 1.0, defaultFillOpacity: 0.7,
        selectedFontWeight: 'bold', defaultFontWeight: 'normal', transitionDuration: transitionDuration
    };

    // Build Node Map
    nodeMap.clear(); data.nodes.forEach((node, index) => nodeMap.set(node.id, { index: index, ...node }));

    // Calculate Scales (uses updated setupScales)
    const scales = setupScales(data.nodes, width, height, nodeRadius); // Use props directly

    // Validate Scales
    if (!scales || !scales.yScale || typeof scales.yScale !== 'function' || !scales.colorScale || typeof scales.colorScale !== 'function') {
         console.error("[ArcDiagram Effect] Invalid scale OBJECT received from setupScales. Aborting draw.", scales);
         return; // Exit effect if scales themselves are fundamentally broken
     }
     // Check domain length *after* ensuring yScale is valid
     if (scales.yScale.domain().length === 0 && data.nodes.length > 0) {
         console.error("[ArcDiagram Effect] Scale domain is empty despite having nodes. Aborting draw.");
         // This case might indicate an issue in node ID filtering or scale creation
         return;
     }
    const { yScale, colorScale, axisXPosition } = scales;
    console.log(`[ArcDiagram Effect] Using Scales for Inner Height: ${height}`); // Log height used for scale range


    // Prepare Containers
    const arcsContainer = zoomGroup.selectAll("g.arcs-container").data([null]).join("g").attr("class", "arcs-container");
    const nodesContainer = zoomGroup.selectAll("g.nodes-container").data([null]).join("g").attr("class", "nodes-container");

    // --- Define Interaction Handlers ---
     const handleMouseOver = (event, d) => {
         localHoveredNodeId.current = d.id;
         const nodeGroup = d3.select(event.currentTarget);
         nodeGroup.select('circle').attr('r', nodeRadius + 2).style('fill-opacity', styles.hoverFillOpacity).style("stroke", styles.hoverStrokeColor).style("stroke-width", styles.hoverStrokeWidth);

         arcsContainer.selectAll('path.arc-path')
             .transition("arcHover").duration(hoverTransitionDuration)
             .each(function(link) { const style = getArcStyle(link, selectedNodeId, d.id); d3.select(this).style('stroke-opacity', style.strokeOpacity).style('stroke-width', style.strokeWidth); });

         if (d.label) { // Add hover info box
             const yPos = yScale(d.id);
             if (yPos !== undefined) {
                 const padding = { x: 6, y: 3 }; const textXOffset = -nodeRadius - 12;
                 const infoBoxGroup = nodeGroup.append("g").attr("class", "dynamic-hover-info").style("pointer-events", "none");
                 const textElement = infoBoxGroup.append("text").attr("class", "hover-info-text text-xs").attr("fill", "black").attr("x", textXOffset).attr("y", 0).attr("text-anchor", "end").attr("dy", "0.35em").text(d.label);
                 const bbox = textElement.node().getBBox();
                 infoBoxGroup.insert("rect", "text").attr("class", "hover-info-rect").attr("x", bbox.x - padding.x).attr("y", bbox.y - padding.y).attr("width", bbox.width + 2 * padding.x).attr("height", bbox.height + 2 * padding.y).attr("rx", 3).attr("ry", 3);
             }
         }
     };
     const handleMouseOut = (event, d) => {
         if (localHoveredNodeId.current !== d.id) return;
         localHoveredNodeId.current = null;
         const nodeGroup = d3.select(event.currentTarget);
         const isSelected = d.id === selectedNodeId;
         nodeGroup.select('circle').transition("hoverOff").duration(hoverTransitionDuration).attr('r', nodeRadius).style('fill-opacity', isSelected ? styles.selectedFillOpacity : styles.defaultFillOpacity).style("stroke", isSelected ? styles.selectedStrokeColor : d3.rgb(colorScale(d.book || 'Unknown')).darker(0.7)).style("stroke-width", isSelected ? styles.selectedStrokeWidth : styles.defaultStrokeWidth);

         arcsContainer.selectAll('path.arc-path')
            .transition("arcHoverOff").duration(hoverTransitionDuration)
             .each(function(link) { const style = getArcStyle(link, selectedNodeId, null); d3.select(this).style('stroke-opacity', style.strokeOpacity).style('stroke-width', style.strokeWidth); }); // Revert using helper

         nodeGroup.select("g.dynamic-hover-info").remove();
     };
     const handleClick = (event, d) => { if (onNodeSelect) onNodeSelect(d.id); event.stopPropagation(); };

    // --- Draw Elements ---
    // Pass null for hoveredId on initial draw/update
    drawAndUpdateArcs(arcsContainer, data.links, yScale, colorScale, axisXPosition, nodeMap, selectedNodeId, null);
    drawAndUpdateNodes(nodesContainer, data.nodes, yScale, colorScale, nodeRadius, axisXPosition, labelFontSize, labelXOffset, { mouseover: handleMouseOver, mouseout: handleMouseOut, click: handleClick }, selectedNodeId, styles);

    // Explicitly Re-apply Arc Styles AFTER Join
    arcsContainer.selectAll('path.arc-path')
        .each(function(d) {
            const style = getArcStyle(d, selectedNodeId, null); // Apply style based on selection only
            d3.select(this)
                .attr('stroke-opacity', style.strokeOpacity) // Use attr for immediate effect
                .attr('stroke-width', style.strokeWidth);
        });

    // --- D3 Zoom Setup ---
    const handleZoom = (event) => { zoomGroup.attr('transform', event.transform); };
    if (!zoomBehaviorRef.current) { zoomBehaviorRef.current = d3.zoom().scaleExtent([0.1, 10]).translateExtent([[-width * 1, -height * 1], [width * 2, height * 2]]).on('zoom', handleZoom); }
    if (svgRef.current && zoomBehaviorRef.current) { rootSvg.call(zoomBehaviorRef.current).on("dblclick.zoom", null); }

    // Cleanup
    return () => { if (svgRef.current) d3.select(svgRef.current).on('.zoom', null); };

  }, [data, width, height, selectedNodeId, onNodeSelect, svgRef, viewMode]); // Keep dependencies correct

  // --- Effect for Zoom Reset ---
  useEffect(() => {
      if (resetZoomTrigger > 0) {
        // console.log('[ArcDiagram ResetZoom Effect] Triggered.');
        if (svgRef.current && zoomBehaviorRef.current) {
            const rootSvg = d3.select(svgRef.current);
            rootSvg.transition().duration(500).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
        }
      }
   }, [resetZoomTrigger, svgRef]);

  // console.log('[ArcDiagram Render] Rendering outer <g>.');
  return <g ref={zoomGroupRef} id="zoom-pan-group"></g>;
}

export default ArcDiagram;