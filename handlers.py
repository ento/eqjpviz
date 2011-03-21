# -*- coding: utf-8 -*-
import os
import logging
from google.appengine.ext.webapp import template
template.register_template_library('helpers')
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app
from google.appengine.dist import use_library
from google.appengine.api import memcache
from models import get_latest_quakes
#use_library('django', '1.1')


here = os.path.dirname(__file__)
templates = os.path.join(here, 'templates')


local_map_key = "ABQIAAAApCc17xw_sX2y1D0IRfZ9thQF9y_VW7YbO34P9zbzd5titAk1JBQYVrqdLJBqmm7_UiKnRWLrO5r1AQ"
production_map_key = "ABQIAAAApCc17xw_sX2y1D0IRfZ9thRlOb26qSyU154aZeLwOrF4C7-DphRThtcCrT9SUkfbx1aqRgFa-JhX7A"


class MainPage(webapp.RequestHandler):
    def get(self):
        context = {
            "scrape_list_ran_at": memcache.get("scrape_list_ran_at"),
            "scrape_details_ran_at": memcache.get("scrape_details_ran_at"),
        }
        
        url = os.environ['HTTP_HOST'] if os.environ.get('HTTP_HOST') else os.environ['SERVER_NAME']
        context["map_api_key"] = local_map_key if ('192' in url) or ('localhost' in url) else production_map_key
        logging.info("url: %s" % url)
        

        path = os.path.join(templates, 'index.html')
        self.response.out.write(template.render(path, context))


class DataSetPage(webapp.RequestHandler):
    def get(self):
        logging.info("get latest quakes")
        context = {
            'quakes': get_latest_quakes(1000),
        }
        logging.info("get latest quakes end")

        path = os.path.join(templates, 'dataset.js')
        self.response.headers['Content-Type'] = 'application/javascript'
        self.response.out.write(template.render(path, context))


class TestPage(webapp.RequestHandler):
    def get(self):
        from workers import scrape_details
        self.response.out.write("%r" % scrape_details(3790))


application = webapp.WSGIApplication(
    [
        ('/', MainPage),
        ('/dataset.js', DataSetPage),
        ('/test', TestPage),
        ],
    debug=True)


def main():
    run_wsgi_app(application)


if __name__ == "__main__":
    main()
