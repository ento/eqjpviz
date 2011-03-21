# -*- coding: utf-8 -*-
import re
import logging
import datetime
from google.appengine.ext import db
from google.appengine.api import memcache


__all__ = [
    'Earthquake',
    'save_list_info',
    'get_by_tenki_id',
    'get_latest_quake',
    'get_latest_quakes',
    'get_quakes_without_details',
    'JST',
    ]


class JST(datetime.tzinfo):
    def utcoffset(self, dt):
        return datetime.timedelta(hours=9)

    def tzname(self, dt):
        return "JST"


class Earthquake(db.Model):
    tenki_id = db.IntegerProperty()
    announced_at = db.DateTimeProperty()
    occurred_at = db.DateTimeProperty()
    epicenter = db.StringProperty()
    magnitude = db.FloatProperty()
    max_intensity = db.IntegerProperty()
    depth = db.StringProperty()
    coord = db.GeoPtProperty()
    has_details = db.BooleanProperty()
    created_at = db.DateTimeProperty(auto_now_add=True)


def save_list_info(tenki_id, date, announced, occurred, epicenter, magnitude, max_intensity):
    date_match = re.search(r"(\d+)[^\d]+(\d+)[^\d]+(\d+)[^\d]+", date)
    base_date = datetime.datetime(year=int(date_match.group(1)), month=int(date_match.group(2)), day=int(date_match.group(3)), tzinfo=JST())
    
    ann_match = re.search(r"(\d+)[^\d]+(\d+)[^\d]+", announced)
    ann_time = base_date + datetime.timedelta(seconds=int(ann_match.group(1)) * 3600 + int(ann_match.group(2)) * 60)

    ocr_match = re.search(r"(\d+)[^\d]+(\d+)[^\d]+", occurred)
    ocr_time = base_date + datetime.timedelta(seconds=int(ocr_match.group(1)) * 3600 + int(ocr_match.group(2)) * 60)

    if ann_time < ocr_time:
        ann_time = ann_time + datetime.timedelta(days=1)

    magnitude = None if magnitude == '---' else float(magnitude[1:])


    eq = Earthquake(
        key_name=str(tenki_id),
        tenki_id=tenki_id,
        announced_at=ann_time,
        occurred_at=ocr_time,
        epicenter=epicenter,
        magnitude=magnitude,
        max_intensity=max_intensity,
        has_details=False,
        )
    eq.put()


def save_details_info(eq, lat, lon, depth):
    lat_deg = re.search(r"(\d+\.?\d+)", lat).group(1) if re.search(r"(\d+\.?\d+)", lat) else None
    lon_deg = re.search(r"(\d+\.?\d+)", lon).group(1) if re.search(r"(\d+\.?\d+)", lon) else None
    depth_alnum = re.search(r"(\d+\.?\d+)", depth).group(1) if re.search(r"(\d+\.?\d+)", depth) else depth
    eq.tenki_id = int(eq.key().name())
    eq.coord = db.GeoPt(float(lat_deg), float(lon_deg)) if lat_deg and lon_deg else None
    eq.depth = depth_alnum
    eq.has_details = True
    eq.put()


def get_by_tenki_id(tenki_id):
    eq_k = db.Key.from_path('Earthquake', str(tenki_id))
    return db.get(eq_k)


def get_latest_quake():
    return Earthquake.all().order("-tenki_id").fetch(1)

def get_latest_quakes(limit=1000):
    logging.debug("get latest quakes start")
    latest = get_latest_quake()
    logging.debug("got latest single")
    if len(latest) > 0 and latest[0].tenki_id != memcache.get("latest_tenki_id"):
        quakes = Earthquake.all().order("-tenki_id").fetch(limit=limit)
        memcache.set("latest_quakes", quakes)
        memcache.set("latest_tenki_id", quakes[0].tenki_id)
        logging.info("memcache miss hit")
        return quakes
    logging.debug("memcache hit")
    return memcache.get("latest_quakes") or []


def get_quakes_without_details(limit=1):
    return Earthquake.all().filter("has_details =", False).order("-tenki_id").fetch(limit=limit)
