(function () {
  'use strict';

  // ---------------------------------------------------------------
  // AIRLINES: id, display name, legend/marker color
  // ---------------------------------------------------------------
  var airlines = [
    { id: 'AA', name: 'American',    color: '#2a78d6' },
    { id: 'DL', name: 'Delta',       color: '#e34948' },
    { id: 'UA', name: 'United',      color: '#173f66' },
    { id: 'WN', name: 'Southwest',   color: '#eda100' },
    { id: 'AS', name: 'Alaska',      color: '#1baf7a' },
    { id: 'B6', name: 'JetBlue',     color: '#4ec3e0' },
    { id: 'F9', name: 'Frontier',    color: '#8b5cf6' },
    { id: 'HA', name: 'Hawaiian',    color: '#e87ba4' },
    { id: 'SY', name: 'Sun Country', color: '#a5732a' }
  ];

  // ---------------------------------------------------------------
  // AIRPORTS: [ displayName, IATA code, lat, lon, entries ]
  // entries: [ [airlineId, 'hub' | 'focus'], ... ]
  //   'hub'   = designated hub or operating base
  //   'focus' = focus city / secondary market (thinner network)
  //
  // Note: d3.geoAlbersUsa() only plots the continental US plus the AK/HI
  // insets, so San Juan (SJU) is kept here for tooltip/data completeness
  // but will not render a marker on the map.
  // ---------------------------------------------------------------
  var airports = [
    ['Seattle/Tacoma', 'SEA', 47.45, -122.31, [['AS', 'hub'], ['DL', 'hub']]],
    ['Anchorage', 'ANC', 61.17, -149.99, [['AS', 'hub']]],
    ['Portland', 'PDX', 45.59, -122.60, [['AS', 'hub']]],
    ['San Diego', 'SAN', 32.73, -117.19, [['AS', 'hub']]],
    ['San Francisco', 'SFO', 37.62, -122.38, [['AS', 'hub'], ['UA', 'hub']]],
    ['Boise', 'BOI', 43.56, -116.22, [['AS', 'focus']]],
    ['San Jose', 'SJC', 37.36, -121.93, [['AS', 'focus']]],
    ['Los Angeles', 'LAX', 33.94, -118.41, [['AA', 'hub'], ['DL', 'hub'], ['UA', 'hub'], ['AS', 'hub'], ['WN', 'hub']]],
    ['Dallas/Fort Worth', 'DFW', 32.90, -97.04, [['AA', 'hub'], ['SY', 'focus']]],
    ['Dallas Love Field', 'DAL', 32.85, -96.85, [['WN', 'hub']]],
    ['Charlotte', 'CLT', 35.21, -80.94, [['AA', 'hub']]],
    ["Chicago–O'Hare", 'ORD', 41.98, -87.90, [['AA', 'hub'], ['UA', 'hub'], ['F9', 'focus']]],
    ['Chicago–Midway', 'MDW', 41.79, -87.75, [['WN', 'hub']]],
    ['Miami', 'MIA', 25.80, -80.29, [['AA', 'hub'], ['F9', 'focus']]],
    ['New York–JFK', 'JFK', 40.64, -73.78, [['AA', 'hub'], ['DL', 'hub'], ['B6', 'hub']]],
    ['New York–LaGuardia', 'LGA', 40.78, -73.87, [['AA', 'hub'], ['DL', 'hub']]],
    ['Newark', 'EWR', 40.69, -74.17, [['UA', 'hub']]],
    ['Philadelphia', 'PHL', 39.87, -75.24, [['AA', 'hub'], ['F9', 'focus']]],
    ['Phoenix', 'PHX', 33.43, -112.01, [['AA', 'hub'], ['WN', 'hub']]],
    ['Washington–National', 'DCA', 38.85, -77.04, [['AA', 'hub']]],
    ['Washington–Dulles', 'IAD', 38.95, -77.46, [['UA', 'hub']]],
    ['Atlanta', 'ATL', 33.64, -84.43, [['DL', 'hub'], ['WN', 'hub'], ['F9', 'focus']]],
    ['Boston', 'BOS', 42.36, -71.01, [['DL', 'hub'], ['B6', 'focus']]],
    ['Detroit', 'DTW', 42.21, -83.35, [['DL', 'hub']]],
    ['Minneapolis/St. Paul', 'MSP', 44.88, -93.22, [['DL', 'hub'], ['SY', 'hub']]],
    ['Salt Lake City', 'SLC', 40.79, -111.98, [['DL', 'hub']]],
    ['Raleigh/Durham', 'RDU', 35.88, -78.79, [['DL', 'focus']]],
    ['Austin', 'AUS', 30.20, -97.67, [['DL', 'focus']]],
    ['Orlando', 'MCO', 28.43, -81.31, [['DL', 'focus'], ['WN', 'hub'], ['F9', 'focus'], ['B6', 'focus']]],
    ['Denver', 'DEN', 39.86, -104.67, [['UA', 'hub'], ['F9', 'hub'], ['WN', 'hub']]],
    ['Houston–Intercontinental', 'IAH', 29.98, -95.34, [['UA', 'hub']]],
    ['Houston–Hobby', 'HOU', 29.65, -95.28, [['WN', 'hub']]],
    ['Honolulu', 'HNL', 21.32, -157.92, [['HA', 'hub']]],
    ['Kahului–Maui', 'OGG', 20.90, -156.43, [['HA', 'hub']]],
    ['Kona', 'KOA', 19.74, -156.05, [['HA', 'focus']]],
    ['Lihue–Kauai', 'LIH', 21.98, -159.34, [['HA', 'focus']]],
    ['Las Vegas', 'LAS', 36.08, -115.15, [['F9', 'focus'], ['SY', 'focus'], ['WN', 'hub']]],
    ['Cleveland', 'CLE', 41.41, -81.85, [['F9', 'focus']]],
    ['Tampa', 'TPA', 27.98, -82.53, [['F9', 'focus']]],
    ['Trenton', 'TTN', 40.28, -74.81, [['F9', 'focus']]],
    ['Fort Lauderdale', 'FLL', 26.07, -80.15, [['B6', 'focus']]],
    ['Long Beach', 'LGB', 33.81, -118.15, [['B6', 'focus']]],
    ['San Juan', 'SJU', 18.44, -66.00, [['B6', 'focus']]],
    ['Baltimore', 'BWI', 39.18, -76.67, [['WN', 'hub']]],
    ['Nashville', 'BNA', 36.13, -86.68, [['WN', 'hub']]],
    ['Oakland', 'OAK', 37.72, -122.22, [['WN', 'hub']]]
  ];

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  var width = 960;
  var height = 600;
  var svg, projection, path, tooltip, activeAirlines;

  function colorOf(id) {
    var found = airlines.filter(function (a) { return a.id === id; })[0];
    return found ? found.color : '#999';
  }

  function drawAirports() {
    svg.selectAll('g.airport').remove();

    var g = svg.append('g').attr('class', 'airport-layer');

    airports.forEach(function (ap) {
      var name = ap[0], code = ap[1], lat = ap[2], lon = ap[3], entries = ap[4];
      var shown = entries.filter(function (e) { return activeAirlines.has(e[0]); });
      if (shown.length === 0) return;

      var coords = projection([lon, lat]);
      if (!coords) return;
      var x = coords[0], y = coords[1];

      var grp = g.append('g')
        .attr('class', 'airport')
        .attr('transform', 'translate(' + x + ',' + y + ')')
        .style('cursor', 'pointer');

      var n = shown.length;
      var baseR = n > 1 ? 9 : 6.5;

      if (n === 1) {
        var aid = shown[0][0], kind = shown[0][1];
        if (kind === 'hub') {
          grp.append('circle')
            .attr('r', baseR)
            .attr('fill', colorOf(aid))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.2);
        } else {
          grp.append('circle')
            .attr('r', baseR)
            .attr('fill', 'none')
            .attr('stroke', colorOf(aid))
            .attr('stroke-width', 2);
        }
      } else {
        var pie = d3.pie().value(1).sort(null);
        var arcs = pie(shown);
        var arcGen = d3.arc().innerRadius(0).outerRadius(baseR);
        arcs.forEach(function (a) {
          var wedgeAid = a.data[0], wedgeKind = a.data[1];
          grp.append('path')
            .attr('d', arcGen(a))
            .attr('fill', colorOf(wedgeAid))
            .attr('fill-opacity', wedgeKind === 'focus' ? 0.35 : 1)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);
        });
        grp.append('circle')
          .attr('r', baseR)
          .attr('fill', 'none')
          .attr('stroke', '#666')
          .attr('stroke-width', 1.2);
      }

      grp.on('mouseenter', function () {
          var rows = '';
          entries.forEach(function (e) {
            var entryAid = e[0], entryKind = e[1];
            var al = airlines.filter(function (a) { return a.id === entryAid; })[0];
            var dim = activeAirlines.has(entryAid) ? '' : 'opacity:0.35;';
            rows += '<div class="t-row" style="' + dim + '">' +
              '<span class="t-dot" style="background:' + al.color + '"></span>' +
              '<span>' + al.name + (entryKind === 'focus' ? ' <span class="t-focus">(focus city)</span>' : '') + '</span>' +
              '</div>';
          });
          tooltip.html('<div class="t-title">' + name + ' (' + code + ')</div>' + rows)
            .style('opacity', 1);
        })
        .on('mousemove', function (event) {
          var pointer = d3.pointer(event, document.querySelector('.hub-map-col'));
          tooltip.style('left', (pointer[0] + 14) + 'px').style('top', (pointer[1] + 10) + 'px');
        })
        .on('mouseleave', function () {
          tooltip.style('opacity', 0);
        });
    });
  }

  function buildLegend() {
    var legend = d3.select('#hubLegend');
    airlines.forEach(function (a) {
      var count = airports.filter(function (ap) {
        return ap[4].some(function (e) { return e[0] === a.id; });
      }).length;
      var item = legend.append('div')
        .attr('class', 'hub-legend-item')
        .attr('data-id', a.id)
        .on('click', function () {
          if (activeAirlines.has(a.id)) {
            activeAirlines.delete(a.id);
            d3.select(this).classed('off', true);
          } else {
            activeAirlines.add(a.id);
            d3.select(this).classed('off', false);
          }
          drawAirports();
        });
      item.append('span').attr('class', 'hub-swatch').style('background', a.color);
      item.append('span').attr('class', 'hub-legend-name').text(a.name);
      item.append('span').attr('class', 'hub-legend-count').text(count);
    });

    d3.select('#hubShowAll').on('click', function () {
      airlines.forEach(function (a) { activeAirlines.add(a.id); });
      d3.selectAll('.hub-legend-item').classed('off', false);
      drawAirports();
    });
    d3.select('#hubHideAll').on('click', function () {
      activeAirlines.clear();
      d3.selectAll('.hub-legend-item').classed('off', true);
      drawAirports();
    });
  }

  function init() {
    svg = d3.select('#hubMap');
    projection = d3.geoAlbersUsa().scale(1180).translate([width / 2, height / 2 - 20]);
    path = d3.geoPath(projection);
    tooltip = d3.select('#hubTooltip');
    activeAirlines = new Set(airlines.map(function (a) { return a.id; }));

    buildLegend();

    d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(function (us) {
      svg.append('g').selectAll('path')
        .data(topojson.feature(us, us.objects.states).features)
        .join('path')
        .attr('class', 'hub-state')
        .attr('d', path);

      drawAirports();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
