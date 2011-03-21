function EQJPOverlay(bounds, map) {
    this.bounds_ = bounds;
    this.paper_ = null;
    this.now_label_ = null;
    this.setMap(map);

}

EQJPOverlay.prototype = new google.maps.OverlayView();

EQJPOverlay.prototype.onRemove = function() {
    this.div_.parentNode.removeChild(this.div_);
    this.div_ = null;
};

EQJPOverlay.prototype.onAdd = function() {
    var div = document.createElement("div");//$('<div id="map_overlay"></div>');
    div.setAttribute("id", "map_overlay");
    this.div_ = div;

    var panes = this.getPanes();
    panes.overlayLayer.appendChild(div);

    this.initPaper(div);
    var map = this.getMap();

};

EQJPOverlay.prototype.saveProjection = function() {
    if (this.getProjection()) {
        this.projection_ = this.getProjection();
    }
    if (this.getMap().getBounds()) {
        this.bounds_ = this.getMap().getBounds();
    }
}


EQJPOverlay.prototype.initPaper = function(container) {
    this.paper_ = Raphael(container, 0, 0);
}

EQJPOverlay.prototype.draw = function() {
    if (!this.now_msec_) {
        this.now_msec_ = (new Date()).getTime();
    }

    this.saveProjection();

    if (!this.projection_ || !this.bounds_) {
        console.log("no projection/bounds");
        return;
    }
    var overlayProjection = this.projection_;
    var mapBounds = this.bounds_;
    var sw = overlayProjection.fromLatLngToDivPixel(mapBounds.getSouthWest());
    var ne = overlayProjection.fromLatLngToDivPixel(mapBounds.getNorthEast());
    var left = sw.x;
    var top = ne.y;
    var width = Math.abs(ne.x - sw.x);
    var height = Math.abs(sw.y - ne.y);


    var div = this.div_;
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.style.width = width + 'px';
    div.style.height = height + 'px';

    var svg = this.paper_.canvas;
    svg.style.left = left + 'px';
    svg.style.top = top + 'px';
    svg.setAttribute("width", width + 'px');
    svg.setAttribute("height", height + 'px');

    // map points
    var show_since = 3 * 60 * 60 * 1000;
    for(var i=0; i<EQJPViz.data_points.length; i++) {
        var dp = EQJPViz.data_points[i];
        var date = dp.occurred.getTime();
        var opacity = Math.max(0, show_since - Math.abs(this.now_msec_ - date)) / show_since;
        if (opacity == 0) {
            if (dp.p != null) {
                dp.p.remove();
                dp.p = null;
            }
        } else {
            if (dp.p == null) {
                var circle = this.paper_.circle(-100, -100, dp.magnitude * 2);
                //circle.attr("cx", pixel.x);
                //circle.attr("cy", pixel.y);
                circle.attr("stroke", "#fff");
                circle.attr("fill", EQJPViz.magnitudeToColor(dp.magnitude));
                dp.p = circle;
            }
            var gpoint = new google.maps.LatLng(dp.lat, dp.lon);
            var pixel = overlayProjection.fromLatLngToContainerPixel(gpoint);
            dp.p.attr({"cx": pixel.x, "cy": pixel.y, "opacity": opacity});
            pixel = null;
            gpoint = null;
        }
    }
}


function dayAsMsec(days) {
    return days * 24 * 60 * 60 * 1000.0;
}

function toLocalTime(dt) {
    if (!dt) {
        return;
    }
    var offset = new Date().getTimezoneOffset();
    return new Date(dt.getTime() - offset * 60 * 1000);
}

/* -------------------------- gradient -------------------------- */

function byte2Hex(n)
{
    var nybHexString = "0123456789ABCDEF";
    return String(nybHexString.substr((n >> 4) & 0x0F,1)) + nybHexString.substr(n & 0x0F,1);
}

function RGB2Color(r,g,b)
{
    return '#' + byte2Hex(r) + byte2Hex(g) + byte2Hex(b);
}

function makeColor(frequency1, frequency2, frequency3,
                   phase1, phase2, phase3,
                   center, width, len, pos)
{
    if (len == undefined)      len = 50;
    if (center == undefined)   center = 128;
    if (width == undefined)    width = 127;

    var i = Math.floor(len * pos);

    var red = Math.sin(frequency1*i + phase1) * width + center;
    var grn = Math.sin(frequency2*i + phase2) * width + center;
    var blu = Math.sin(frequency3*i + phase3) * width + center;
    return RGB2Color(red,grn,blu);
}

function pickMagnitudeColor(ratio) {
    return makeColor(0.1, 0.1, 0.1, 2*Math.PI*90/360, 2*Math.PI*(90+240)/360, 2*Math.PI*(90+120)/360, 128+24, 127-24, 40, ratio);
}


/* -------------------------- the protagonist -------------------------- */

var EQJPViz = (function (){
    var map_width = 500;
    var map_height = map_width * 0.8;
    var data_points = [];
    var daterange_msec = dayAsMsec(10);
    var daterange_start = (new Date()).getTime() - daterange_msec;
    var slider_max = 100;
    var mag_max = 8.0;
    var mag_min = 1.0;
    var playing = false;
    var autoplayed = false;

    var overlay;
    var playbackControl;
    var dateLabelControl;
    var incidentChart;
    var dateChart;
    var daynightChart;

    var map;

    var initialize = function() {
        var lat = 38.307181;
        var lon = 139.438477;
        lat = 37.5448165;
        lon = 137.504883;
        var sspn = new google.maps.LatLng(35.410182, 54.404297);
        var zoom = 5;


        loadDataPoints();

        var $content = $("#content");
        var $mapdiv = $("#map_canvas");
        var useragent = navigator.userAgent;
        if (useragent.indexOf('iPhone') != -1 || useragent.indexOf('Android') != -1 ) {
            $content.css({width: '100%'});
            map_width = $content.width() * 0.9;
            map_height = map_width * 0.8;
            $mapdiv.width(map_width);
        } else {
            $content.width(map_width);
        }

        $mapdiv.css({width: map_width, height: map_height});

        var center = new google.maps.LatLng(lat, lon);
        map = new google.maps.Map(document.getElementById("map_canvas"), {
            zoom: 5,
            center: center,
            mapTypeId: google.maps.MapTypeId.SATELLITE,
            noClear: true,
            //minZoom: 5,
        });

        var sw = new google.maps.LatLng(lat - sspn.lat() * 0.1, lon - sspn.lng() * 0.1);
        var ne = new google.maps.LatLng(lat + sspn.lat() * 0.1, lon + sspn.lng() * 0.1);
        var bounds = new google.maps.LatLngBounds(sw, ne);
        map.fitBounds(bounds);

        // overlay
        overlay = new EQJPOverlay(bounds, map);

        // 
        createPlaybackControl();
        createDateLabelControl();
        createIncidentChart();
        createDateChart();
        createMagnitudeChart();
        connectEvents();
    };

    var loadDataPoints = function() {
        for(var i=0; i<dataset.length; i++) {
            var data = dataset[i];
            var dp = {label:data[0], occurred:data[1], magnitude:data[2], lat:data[3], lon:data[4], p:null};
            data_points.push(dp);
        }
    }

    var connectEvents = function() {
        google.maps.event.addListener(map, 'projection_changed', function() {overlay.saveProjection();});
        google.maps.event.addListener(map, 'bounds_changed', function() {overlay.saveProjection();});
        google.maps.event.addListener(map, 'center_changed', function() {overlay.saveProjection();});
    }

    var createPlaybackControl = function() {
        playbackControl = $('<div id="playback_control"></div>');
        var playButton = $('<div id="play" class="pause">&nbsp;</div>');
        var dateSlider = $('<div id="slider"></div>');
        playbackControl.append(playButton);
        $("#slider_container").append(dateSlider);

        dateSlider.slider({
	    value:100,
	    min: 0,
	    max: slider_max,
	    step: 1,
	    slide: function(event, ui) {sliderChanged(event, ui);},
	    change: function(event, ui) {sliderChanged(event, ui);},
        });

        playButton.button().click(function() {
            if ($(this).hasClass("play")) {
                EQJPViz.pausePlaying();
            } else {
                EQJPViz.startPlaying();
            }
        });

        map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(playbackControl.get(0));
    };

    var createDateLabelControl = function() {
        dateLabelControl = $('<div id="date_label">Loading</div>');
        map.controls[google.maps.ControlPosition.TOP_CENTER].push(dateLabelControl.get(0));
    };

    var datetimeToChartX = function(dt) {
        var msec = dt.getTime();
        var xunit_msec = daterange_msec / slider_max;
        return (msec - daterange_start) / xunit_msec;
    };

    var datetimeToPixelX = function(dt) {
        var msec = dt.getTime();
        var unit_pixel = map_width / slider_max;
        var unit_msec = daterange_msec / slider_max;
        return ((msec - daterange_start) / unit_msec) * unit_pixel;
    };

    var createIncidentChart = function() {
        incidentChart = Raphael("incident_chart", "100%", "100%");
        
        var lines = {};
        var createEmptyY = function() {
            var yaxis = [];
            for (var x = 0; x <= slider_max; x++) {
                yaxis.push(0);
            }
            return yaxis;
        };
        // reduce to incident count
        for (var i in data_points) {
            var dp = data_points[i];
            if (!dp.occurred) {
                continue;
            }
            var m = Math.floor(dp.magnitude);
            if (!(m in lines)) {
                lines[m] = createEmptyY();
            }
            var x = Math.floor(datetimeToChartX(dp.occurred));
            if (!(x in lines[m])) {
                lines[m][x] = 0;
            }
            lines[m][x] = lines[m][x] + 1;
        }
        // generate xaxis values
        var xaxis = [];
        for (var x = 0; x <= slider_max; x++) {
            xaxis.push(x);
        }
        // collect non-undefined lines
        var y = [];
        var m_all = [];
        for (var m in lines) {
            if (lines[m] != undefined) {
                m_all.push(m);
            }
        }
        m_all.sort();
        for (var i in m_all) {
            var m = m_all[i];
            y.push(lines[m]);
        }
        var series = incidentChart.g.linechart(0, 0, map_width, 40, xaxis, y);
        for (var i in m_all) {
            var m = m_all[i];
            series.lines[i].attr({"stroke": magnitudeToColor(m), "stroke-width": 1});
        }
    }

    var createDateChart = function() {
        dateChart = Raphael("date_chart", "100%", "100%");
        daynightChart = Raphael("daynight_chart", "100%", "100%");

        var unitMsec = 1000 * 60 * 60 * 6;
        var end = daterange_start + daterange_msec;
        var here = Math.ceil(daterange_start / unitMsec) * unitMsec;
        var unitX = map_width / (daterange_msec / unitMsec);
        while (here < end) {
            var dt = toLocalTime(new Date(here));
            var hour = dt.getHours();
            var x = datetimeToPixelX(dt);
            var label = dateChart.text(0, 0, DateFormatter.format(dt, "Y/m/d H:i"));
            var bbox = label.getBBox();
            label.attr({"text-anchor": "middle"});
            label.rotate(270, x, bbox.height*0.5);
            label.attr({"x": x+bbox.height*0.5-bbox.width*0.5, "y":-bbox.height});
            if (hour == 6 || hour == 18) {
                label.remove();
            }
            here += unitMsec;

            var box = daynightChart.rect(x-unitX-bbox.height*0.5, 0, unitX, 10);
            var angle = 0;
            var night = "#003";
            var dawn = "#069";
            var noon = "#db3";
            var dusk = dawn; //"#d64";
            var gradient = "0-#fff-#000";
            var from;
            var to;
            switch(hour) {
            case 0:
                from = night;
                to = dawn;
                break;
            case 6:
                from = dawn;
                to = noon;
                break;
            case 12:
                from = noon;
                to = dusk;
                break;
            case 18:
                from = dusk;
                to = night;
                break;
            }
            box.attr({fill: angle+"-"+from+"-"+to, "stroke-width":0});
        }
    }

    var magnitudeToColor = function(mag) {
        var magRange = mag_max - mag_min;
        var pos = Math.min((magRange - (mag - mag_min)) / magRange, 1.0);
        return pickMagnitudeColor(pos);
    }

    var createMagnitudeChart = function() {
        container = $('<div id="magnitude_chart"></div>');
        map.controls[google.maps.ControlPosition.RIGHT_CENTER].push(container.get(0));
        
        magnitudeChart = Raphael(container.get(0), "100%", "100%");
        var margin = map_height * 0.15;
        var unitY = (map_height - margin * 2) / (mag_max - mag_min);
        var x = 18;
        for (var m = mag_max; m >= mag_min; m--) {
            var y = margin + (mag_max - m) * unitY;
            var outline = magnitudeChart.text(x, y + 18 + 7, "M"+m+"~");
            outline.attr({"fill": "#fff", "stroke": "#fff", "font-weight": "900", "stroke-linejoin": "bevel", "stroke-width": 2.5});
            var label = magnitudeChart.text(x, y + 18 + 7, "M"+m+"~");
            label.attr({"fill": "#000"});
            var circle = magnitudeChart.circle(x, y, m * 2);
            circle.attr("stroke", "#fff");
            circle.attr("fill", magnitudeToColor(m));
        }
    };

/*
    Raphael.fn.g.flag=function(x,y,label,rotation){
        rotation=rotation||0;
        label=label||"$9.99";
        var g=this.set(),margin=3;
        g.push(this.path().attr({
            fill:"#000",stroke:"#000"}
                               ));
        g.push(this.text(x,y,label).attr(this.g.txtattr).attr({
            fill:"#fff","font-family":"Helvetica, Arial"}
                                                             ));
        g.update=function(x,y){
            this.rotate(0,x,y);
            var bbox=this[1].getBBox(),halfH=bbox.height/2;
            this[0].attr({
                path:["M",x,y,"l",halfH+margin,-halfH-margin,bbox.width+2*margin,0,0,bbox.height+2*margin,-bbox.width-2*margin,0,"z"].join(",")}
                        );
            this[1].attr({
                x:x+halfH+margin+bbox.width/2,y:y}
                        );
            rotation=360-rotation;
            this.rotate(rotation,x,y);
            i>90&&i<270&&this[1].attr({
                x:x-r-margin-bbox.width/2,y:y,rotation:[180+rotation,x,y]}
                                     );
            return this;
        };
        return g.update(x,y);
    };
*/        
    var sliderChanged = function(event, ui) {

        var val = ui.value;
        var now = daterange_start + (daterange_msec * val / 100);

        dateLabelControl.text(DateFormatter.format(toLocalTime(new Date(now)), "Y/m/d(J) H:i #J#S#T"));

        overlay.now_msec_ = now;
        overlay.draw.apply(overlay);
    };

    var pausePlaying = function() {
        playing = false;
        $("#play").removeClass("play").addClass("pause").button("option", "label", "&gt;");
    };

    var startPlaying = function() {
        if ($("#play").length > 0 && $("#slider").length > 0) {
            playing = true;
            $("#play").removeClass("pause").addClass("play").button("option", "label", "--");
            $("#slider").slider("value", 0);
            return true;
        }
        return false;
    };

    var tick = function() {
        if (playing) {
            var $slider = $("#slider");
            var value = $slider.slider("value");
            if (value < 100) {
                $slider.slider("value", value + 1);
            } else {
                pausePlaying();
            }
        }
        if (!autoplayed) {
            autoplayed = startPlaying();
        }
    };

    return {
        initialize: initialize,
        startPlaying: startPlaying,
        pausePlaying: pausePlaying,
        tick: tick,
        data_points: data_points,
        magnitudeToColor: magnitudeToColor,
    };
    
})();


$(function(){
    EQJPViz.initialize();
    setInterval(EQJPViz.tick, 100);
    //setTimeout(EQJPViz.startPlaying, 1000);
});