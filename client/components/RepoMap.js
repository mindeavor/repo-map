var m = require('mithril')
var Stream = require('mithril/stream')
var GitHub = require('../models/github')

// d3-timeline needs d3 to be globally-accessible
var d3 = require('d3')
var Timeline = require('d3-timeline')
var timeAgo = require('date-fns/distance_in_words_to_now')

var modes = {
  nineDays: {
    start: Date.now() - 1000 * 60 * 60 * 24 * 9,
    end: Date.now(),
    tickFormat: { tickTime: d3.timeDay, tickSize: 6 }
  },
  thirtyDays: {
    start: Date.now() - 1000 * 60 * 60 * 24 * 30,
    end: Date.now(),
    tickFormat: { tickTime: d3.timeDay, tickSize: 6 }
  },
  thirtyCommits: {
    start: 0,
    end: 0,
    tickFormat: { tickTime: d3.timeDay, tickSize: 6 }
  }
}

exports.oninit = function (vnode) {
  console.log("hm")
  var state = vnode.state

  state.mode = 'thirtyCommits'
  state.branches = Stream()

  GitHub.singleBranchForkCommits(vnode.attrs.repo, vnode.attrs.branch)
    .then( state.branches )
    .catch(err => console.log("forkBranches err:", err))

  state.timeWindow = Stream( modes.thirtyCommits )
  // state.availableBranches = Stream()

  // GitHub.repoBranches(vnode.attrs.repo).then( state.availableBranches )
}

exports.view = function (vnode) {
  console.log("redraw")
  var activeCommit = vnode.state.activeCommit
  return m('.repo-map', [


    m('button', {
      onclick: () => {
        localStorage.clear()
        window.location.reload(false) // Refresh from browser cache
      }
    }, "Clear cache & refresh"),


    vnode.state.branches() ? [
      m('.graph', { oncreate: renderGraph.papp(vnode.state) }),
      m('p',
        m('span', "Cached at ")
      )
    ] : [
      m('p', "Loading...")
    ],

    m('select', {
      value: vnode.state.mode,
      onchange: e => {
        vnode.state.timeWindow( modes[e.currentTarget.value] )
      }
    }, [
      m('option[value=nineDays]', "Last 9 days"),
      m('option[value=thirtyDays]', "Last 30 days"),
      m('option[value=thirtyCommits]', "Last 30 Commits"),
    ]),

    // m('select', {
    //   onchange: e => {
    //     history.pushState({ url: `forks/${vnode.attrs.repo}/${e.currentTarget.value}` }, '', `/forks/${vnode.attrs.repo}/${e.currentTarget.value}`)
    //     GitHub.singleBranchForkCommits(vnode.attrs.repo, e.currentTarget.value).map(vnode.state.branches)
    //   }
    // }, vnode.state.availableBranches.map( option =>
    //     m(`option[value=${option.name}]`, `${option.name}`)
    //   )
    // ),

    m('.commit-info', activeCommit && [
      m('h3', activeCommit.commit.message),
      m('p', `by ${activeCommit.commit.author.name}, ${timeAgo(activeCommit.starting_time)} ago.`),
    ])
  ])
}

function renderGraph (state, vnode) {
  //
  // Map data we get back from forkBranches to a format Timeline will accept
  //
  var timelineDataStream = Stream.combine(function (timeWindow, forkBranches) {

    return forkBranches().map(function (branch) {
      return {
        label: branch.name,
        times: processCommits(timeWindow().start, branch.commits)
      }
    })

  }, [ state.timeWindow, state.branches ])

  //
  // Next, create the chart
  //
  state.chart = Timeline()
    .stack(true)
    .display('circle')
    .identifyPointBy( commit => commit.sha )

    .mouseover(function (d, i, datum) {
      state.activeCommit = d
      m.redraw()
    })
    .mouseout(function () {
      state.activeCommit = undefined
    })

  //
  // Stream config values into chart
  //
  state.timeWindow.map( time =>
    state.chart
      .beginning(time.start)
      .ending(time.end)
      .tickFormat(time.tickFormat)
  )

  //
  // And finally, add chart to page,
  // auto-updating when config or data changes.
  //
  var svg = d3.select( vnode.dom ).append('svg')
    .attr('width', document.body.clientWidth)

  state.chart.init(svg)

  Stream.combine(function (a, b) {
    state.chart.render(svg, b())
  }, [state.timeWindow, timelineDataStream])
}

function processCommits (startTime, commits) {
  var commitTimes = commits
    .map(function (commit) {
      var time = new Date(commit.commit.author.date).getTime()

      // Extend data point for timeline lib
      commit.starting_time = time
      commit.ending_time = time + 1000*60*15

      return commit
    })

  return startTime > 0
    ? commitTimes.filter( time => time.starting_time > startTime )
    : commitTimes
}
