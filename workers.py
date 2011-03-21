# -*- coding: utf-8 -*-
import os
import re
import logging
import datetime
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app
from google.appengine.api import urlfetch
from google.appengine.api import taskqueue
from google.appengine.api import memcache
from BeautifulSoup import BeautifulSoup
from models import save_list_info, save_details_info
from models import get_by_tenki_id, get_quakes_without_details, get_latest_quake


list_url = "http://tenki.jp/earthquake/entries?p=%d"
details_url = "http://tenki.jp/earthquake/detail-%d.html"



def get_latest_id(page=1):
    ids = [tenki_id for tenki_id, d, a, o, e, m, i in iter_quakes(page)]
    ids.sort()
    return ids[-1]


def iter_quakes(page):
    url = list_url % page
    result = urlfetch.fetch(url, deadline=10)

    if result.status_code != 200:
        return

    soup = BeautifulSoup(result.content)
    table = soup.find(id="seismicInfoEntries")
    for tr in table.findAll('tr'):
        cols = tr.findAll('td')
        if len(cols) == 0:
            continue
        date, announced, occurred, epicenter, magnitude, max_intensity = cols
        yield get_tenki_id(announced), date.text, announced.text, occurred.text, epicenter.text, magnitude.text, get_max_intensity(max_intensity)


def get_tenki_id(td):
    href = td.find('a')['href']
    return int(re.search(r"detail-(\d+).html", href).group(1))


def get_max_intensity(td):
    img = td.find('img')
    if img is None:
        return None
    title = img['title']
    return int(re.search(r"(\d+)", title).group(1))


def scrape_list(page=1, until_id=None, last_id=None):
    logging.debug("scraping page %r, until %r, last %r" % (page, until_id, last_id))
    if last_id != None:
        last_id = int(last_id)
    last_id_on_page = None
    for tenki_id, d, a, o, e, m, i in iter_quakes(page):
        if until_id != None and tenki_id <= until_id:
            logging.debug("reached until_id: %r, current tenki_id:%r" % (until_id, tenki_id))
            return
        last_id_on_page = tenki_id
        save_list_info(tenki_id, d, a, o, e, m, i)
        queue_scrape_details(tenki_id=tenki_id)

    # abort on second pass
    if last_id == last_id_on_page:
        logging.debug("reached the end of list (last_id:%r, last_id_on_page:%r)" % (last_id, last_id_on_page))
        return

    queue_scrape_list(page=page + 1, until_id=until_id, last_id=last_id_on_page)


def queue_scrape_list(**kw):
    stripped = dict([(k, v) for k, v in kw.iteritems() if v != None])
    taskqueue.add(url='/worker/scrape_list', params=stripped)
    logging.debug("queued scrape_list %r" % (stripped,))


def fillout_details(limit=100):
    for eq in get_quakes_without_details(limit):
        logging.debug("filling out %r" % eq)
        queue_scrape_details(tenki_id=eq.key().name())


def scrape_details(tenki_id):
    eq = get_by_tenki_id(tenki_id)
    if eq.has_details:
        return

    url = details_url % int(tenki_id)
    result = urlfetch.fetch(url, deadline=10)

    if result.status_code != 200:
        return

    soup = BeautifulSoup(result.content)
    wrap = soup.find(id="wrap_earthquakeDetailTable")
    
    lat = wrap.find("th", abbr=u"緯度").parent.find('td').text
    lon = wrap.find("th", abbr=u"経度").parent.find('td').text
    depth = wrap.find("th", abbr=u"深さ").parent.find('td').text

    save_details_info(eq, lat, lon, depth)


def queue_scrape_details(**kw):
    stripped = dict([(k, v) for k, v in kw.iteritems() if v != None])
    taskqueue.add(url='/worker/scrape_details', params=stripped)
    logging.debug("queued scrape_details %r" % (stripped,))


def return_ok(handler):
    handler.response.headers['Content-Type'] = 'text/plain'
    handler.response.out.write('ok')


class ScrapeListWorker(webapp.RequestHandler):
    def post(self):
        page = int(self.request.get('page', '1'))
        until_id = self.request.get('until_id', None)
        last_id = self.request.get('last_id', None)
        scrape_list(page=page, until_id=until_id, last_id=last_id)
        return_ok(self)
    get = post


class KickListWorker(webapp.RequestHandler):
    def post(self):
        page = int(self.request.get('page', '1'))
        until_id = self.request.get('until_id', None)
        if until_id is None:
            already_scraped = get_latest_quake()
            if len(already_scraped) > 0:
                until_id = int(already_scraped[0].key().name())
        last_id = self.request.get('last_id', None)
        scrape_list(page=page, until_id=until_id, last_id=last_id)
        memcache.set("scrape_list_ran_at", datetime.datetime.now())
        return_ok(self)
    get = post


class ScrapeDetailsWorker(webapp.RequestHandler):
    def post(self):
        tenki_id = self.request.get('tenki_id', None)
        if tenki_id is None:
            return
        scrape_details(tenki_id=tenki_id)
        return_ok(self)
    get = post


class KickDetailsWorker(webapp.RequestHandler):
    def post(self):
        fillout_details(limit=100)
        memcache.set("scrape_details_ran_at", datetime.datetime.now())
        return_ok(self)
    get = post


application = webapp.WSGIApplication(
    [
        ('/worker/scrape_list', ScrapeListWorker),
        ('/worker/scrape_details', ScrapeDetailsWorker),
        ('/worker/kick_list', KickListWorker),
        ('/worker/kick_details', KickDetailsWorker),
     ],
    debug=True)


def main():
    run_wsgi_app(application)


if __name__ == "__main__":
    main()
