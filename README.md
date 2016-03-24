# DynamicTableSparkline
Dynamic table extension for Qlik Sense with sparklines

Table with support for dynamically reordering of data with sparklines.

-Click on a header to set the column to be the primary used for sorting.

-Click on an arrow in the header to reverse sort order.

-Current sort order is displayed in the header with a black arrow for the primary sort column and a gray for other columns.

-In order for the sparkline to work you need to enter the sparkline measure which will be a text field containing the keyword "$(SET)" within the measure.  The keyword will be replace by a set analysis statement based on the dimensions of the row.

Also supports selections and simple paging.


##Limitation
Only supports 20 columns (previous version only 10)

Only supports base level field, not master items.

Sparkline measure can't have set analysis