var dataset = [
    {% for eq in quakes %}
    [
     "{{ eq.epicenter}}",
     {{ eq.occurred_at|js_date }},
     {{ eq.magnitude|number_or_null }},
     //{{ eq.max_intensity|number_or_null }},
     //"{{ eq.depth|default:"null" }}",
     {{ eq.coord.lat|number_or_null }},
     {{ eq.coord.lon|number_or_null }}
    ],
    {% endfor %}
];
