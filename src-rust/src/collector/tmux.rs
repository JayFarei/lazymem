use anyhow::Result;

use crate::collector::run_command;
use crate::state::TmuxPane;

pub async fn collect_tmux() -> Result<Vec<TmuxPane>> {
    let output = match run_command(&[
        "tmux",
        "list-panes",
        "-a",
        "-F",
        "#{session_name}\t#{window_index}.#{pane_index}\t#{pane_tty}\t#{pane_current_command}\t#{pane_current_path}",
    ])
    .await
    {
        Ok(output) => output,
        Err(_) => return Ok(Vec::new()),
    };

    Ok(parse_tmux_panes_output(&output))
}

pub fn parse_tmux_panes_output(output: &str) -> Vec<TmuxPane> {
    output
        .lines()
        .filter_map(|line| {
            if !line.contains('\t') {
                return None;
            }

            let mut parts = line.splitn(5, '\t');
            Some(TmuxPane {
                session: parts.next()?.to_string(),
                pane: parts.next()?.to_string(),
                tty: parts.next()?.to_string(),
                cmd: parts.next()?.to_string(),
                path: parts.next()?.to_string(),
            })
        })
        .collect()
}
