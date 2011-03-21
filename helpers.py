# -*- coding: utf-8 -*-
from google.appengine.ext import webapp


register = webapp.template.create_template_register()


@register.filter
def js_date(dt):
    if dt is None:
        return "null"
    #return "new Date(%d, %d, %d)" % (dt.year, dt.month, dt.day)
    return "new Date(%d, %d, %d, %d, %d, %d)" % (dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second)


@register.filter
def number_or_null(value):
    if isinstance(value, (int, long, float, complex)):
        return value
    return "null"
